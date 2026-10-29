import { asc, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import { answerEvents } from "../../../db/schema";

type AnswerEvent = {
  id: string;
  questionId: string;
  response: string[];
  correct: boolean;
  answeredAt: string;
};

async function listEvents(userId: string) {
  const rows = await getDb().select().from(answerEvents)
    .where(eq(answerEvents.userId, userId))
    .orderBy(asc(answerEvents.answeredAt), asc(answerEvents.id));
  return rows.map(({ id, questionId, response, correct, answeredAt }) => ({
    id, questionId, response: JSON.parse(response) as string[], correct, answeredAt,
  }));
}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "未登录" }, { status: 401 });
  return Response.json({ events: await listEvents(user.userId) });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "未登录" }, { status: 401 });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "无效的 JSON" }, { status: 400 });
  }
  const events = payload && typeof payload === "object" && "events" in payload
    ? payload.events : null;
  if (!Array.isArray(events) || !events.every((event): event is AnswerEvent =>
    event && typeof event === "object" &&
    typeof event.id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(event.id) &&
    typeof event.questionId === "string" && event.questionId.trim() !== "" &&
    Array.isArray(event.response) && event.response.every((value: unknown) => typeof value === "string") &&
    typeof event.correct === "boolean" &&
    typeof event.answeredAt === "string" && event.answeredAt.endsWith("Z") && !Number.isNaN(Date.parse(event.answeredAt))
  )) {
    return Response.json({ error: "无效的作答记录" }, { status: 400 });
  }

  if (events.length) {
    const db = getDb();
    const rows = events.map(event => ({
      userId: user.userId,
      id: event.id,
      questionId: event.questionId,
      response: JSON.stringify(event.response),
      correct: event.correct,
      answeredAt: event.answeredAt,
    }));
    // D1 allows 100 bound parameters per statement; 10 rows use 60.
    const first = db.insert(answerEvents).values(rows.slice(0, 10)).onConflictDoNothing();
    const rest = [];
    for (let index = 10; index < rows.length; index += 10) {
      rest.push(db.insert(answerEvents).values(rows.slice(index, index + 10)).onConflictDoNothing());
    }
    await db.batch([first, ...rest]);
  }
  return Response.json({ events: await listEvents(user.userId) });
}
