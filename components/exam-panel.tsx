"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, Clock3, List, RefreshCw, X } from "lucide-react";
import { createExamSession, finishExam, getSubjectQuestions, gradeExam, loadExamSession, remainingSeconds, saveExamSession, SUBJECTS, type ExamSession } from "../lib/exam-session";
import { saveAnswerEvents } from "../lib/offline-events";
import type { QuestionBank } from "../lib/question-bank";

const typeNames = { single: "单选题", multiple: "多选题", judge: "判断题", fill: "填空题" };

function countdown(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}

export function ExamPanel({ bank, active, onSubmitted, onRestore, onPractice }: {
  bank: QuestionBank | null;
  active: boolean;
  onSubmitted: () => Promise<void>;
  onRestore: () => void;
  onPractice: () => void;
}) {
  const [session, setSession] = useState<ExamSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [setup, setSetup] = useState(false);
  const [index, setIndex] = useState(0);
  const [seconds, setSeconds] = useState(3600);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [resultSaved, setResultSaved] = useState(false);
  const [wrongOnly, setWrongOnly] = useState(false);
  const sessionRef = useRef<ExamSession | null>(null);
  const saveQueue = useRef(Promise.resolve());
  const submitLock = useRef(false);
  const drawer = useRef<HTMLDialogElement>(null);
  const confirmation = useRef<HTMLDialogElement>(null);

  const submit = useCallback(async () => {
    const current = sessionRef.current;
    if (!current || submitLock.current) return;
    submitLock.current = true;
    setSubmitting(true); setError(""); confirmation.current?.close();
    const finished = finishExam(current);
    sessionRef.current = finished; setSession(finished); setSeconds(0);
    try {
      await saveQueue.current;
      await saveExamSession(finished);
      await saveAnswerEvents(gradeExam(finished).events);
      setResultSaved(true);
      await onSubmitted();
    } catch {
      setError("交卷结果尚未完整保存，请留在本页点击重试。试卷和答案会保留，重试不会重复计入作答。");
    } finally {
      submitLock.current = false; setSubmitting(false); setSaving(false);
    }
  }, [onSubmitted]);

  useEffect(() => {
    let cancelled = false;
    loadExamSession().then(async saved => {
      if (cancelled) return;
      sessionRef.current = saved; setSession(saved); setLoading(false);
      if (!saved) return;
      setSeconds(remainingSeconds(saved));
      if (!saved.submittedAt) onRestore();
      if (saved.submittedAt || remainingSeconds(saved) === 0) await submit();
    }).catch(() => {
      if (!cancelled) { setError("无法读取本地试卷，请检查浏览器存储后刷新页面。"); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [onRestore, submit]);

  useEffect(() => {
    if (!session || session.submittedAt) return;
    const tick = () => {
      const current = sessionRef.current;
      if (!current || current.submittedAt) return;
      const remaining = remainingSeconds(current);
      setSeconds(remaining);
      if (remaining === 0) void submit();
    };
    const timer = window.setInterval(tick, 1000);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    tick();
    return () => { window.clearInterval(timer); window.removeEventListener("focus", tick); document.removeEventListener("visibilitychange", tick); };
  }, [session?.id, session?.submittedAt, submit]);

  const result = useMemo(() => session?.submittedAt ? gradeExam(session) : null, [session]);
  const question = session?.questions[index];
  const response = question && session ? session.responses[question.id] ?? [] : [];
  const answeredCount = session?.questions.filter(item => (session.responses[item.id] ?? []).some(value => value.trim())).length ?? 0;
  const reviewIndexes = session?.questions.map((_, itemIndex) => itemIndex).filter(itemIndex => !wrongOnly || !result?.events[itemIndex].correct) ?? [];
  const currentResult = result?.events[index];

  async function start(subjectId: string) {
    if (!bank) return;
    setError(""); setSaving(true);
    try {
      const next = createExamSession(bank, subjectId);
      await saveExamSession(next);
      sessionRef.current = next; setSession(next); setSeconds(remainingSeconds(next));
      setSetup(false); setIndex(0); setWrongOnly(false); setResultSaved(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (failure) { setError(failure instanceof Error ? failure.message : "试卷未能保存，请重试。"); }
    finally { setSaving(false); }
  }

  function saveDraft(next: ExamSession) {
    setSaving(true); setError("");
    saveQueue.current = saveQueue.current.then(() => saveExamSession(next)).then(() => {
      if (sessionRef.current === next) { setSaving(false); setError(""); }
    }).catch(() => {
      setSaving(false);
      setError("最新答案尚未保存。请保持本页打开，并点击重试保存。");
    });
  }

  function answer(value: string[]) {
    const current = sessionRef.current;
    if (!current || current.submittedAt || !question) return;
    if (remainingSeconds(current) === 0) { void submit(); return; }
    const next = { ...current, responses: { ...current.responses, [question.id]: value } };
    sessionRef.current = next; setSession(next); saveDraft(next);
  }

  function chooseQuestion(next: number) {
    setIndex(next); drawer.current?.close(); window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function numberGrid() {
    return <div className="number-grid exam-number-grid">{reviewIndexes.map(itemIndex => {
      const item = session!.questions[itemIndex];
      const answered = (session!.responses[item.id] ?? []).some(value => value.trim());
      const state = result ? result.events[itemIndex].correct ? "done-right" : "done-wrong" : answered ? "exam-answered" : "";
      return <button key={item.id} onClick={() => chooseQuestion(itemIndex)} className={`${state} ${index === itemIndex ? "current" : ""}`} aria-current={index === itemIndex ? "step" : undefined} aria-label={`测试第 ${itemIndex + 1} 题，${result ? result.events[itemIndex].correct ? "答对" : "答错或未答" : answered ? "已作答" : "未作答"}`}>{itemIndex + 1}</button>;
    })}</div>;
  }

  return <section className="exam-panel" hidden={!active} aria-label="模拟测试">
    {loading ? <div className="empty-state" role="status"><RefreshCw className="spinning" /><h2>正在读取试卷</h2></div> : !session || setup ? <>
      <div className="exam-intro"><span className="eyebrow">模拟测试</span><h1>练一场，看看掌握了多少。</h1><p>每场随机 150 题 · 限时 60 分钟 · 90 分及格</p><p className="muted">判断 15 题、单选 90 题、多选 45 题，每题 1 分，满分 150 分。</p><p className="muted">交卷后统一查看答案与解析，错题自动加入错题本。</p><p className="muted">iPhone Safari：分享 → 添加到主屏幕；Mac Safari（macOS 14+）：文件 → 添加到程序坞；安卓：浏览器菜单 → 安装应用或添加到主屏幕。</p></div>
      {error && <p className="inline-error" role="alert">{error}</p>}
      <div className="exam-subjects">{SUBJECTS.map(subject => {
        const questions = bank ? getSubjectQuestions(bank, subject.id) : [];
        const ready = questions.filter(q => q.type === "judge").length >= 15 && questions.filter(q => q.type === "single").length >= 90 && questions.filter(q => q.type === "multiple").length >= 45;
        return <article className="exam-subject-card" key={subject.id}><ClipboardCheck size={25} /><h2>{subject.name}</h2><p>{subject.moduleNames.join("、")}</p><div><span>已下载 {questions.length} 题</span><button className="primary-button" disabled={!ready || saving} onClick={() => void start(subject.id)}>{saving ? "正在准备…" : "开始测试"}</button></div>{!ready && <small>题库需要至少 15 道判断、90 道单选和 45 道多选题。</small>}</article>;
      })}</div>
      {session && <button className="secondary-button" onClick={() => setSetup(false)}>返回本次结果</button>}
    </> : <>
      <div className="exam-toolbar"><div><span className="eyebrow">{result ? "测试结果" : "模拟测试"}</span><h1>{session.subjectName}</h1></div>{!result && <div className={`exam-countdown ${seconds <= 300 ? "urgent" : ""}`} role="timer" aria-label="测试剩余时间"><Clock3 size={18} />{countdown(seconds)}</div>}<button className="secondary-button" onClick={() => drawer.current?.showModal()}><List size={17} />答题卡</button></div>
      {error && <p className="notice" role="alert">{error}<button disabled={submitting} onClick={() => session.submittedAt ? void submit() : saveDraft(session)}>重试{session.submittedAt ? "交卷" : "保存"}</button></p>}
      {result && <div className={`exam-score ${result.passed ? "passed" : "failed"}`} aria-live="polite"><div><strong>{result.score}<small> / {session.scoring === "uniform-150" ? 150 : 100} 分</small></strong><span>{result.passed ? "达到及格线" : "暂未达到及格线"}</span></div><p>答对 {result.correctCount} 题 · 答错或未答 {result.wrongCount} 题（未答 {result.unansweredCount} 题）</p><p>{resultSaved ? "结果已保存，错题已更新；联网后同步。" : submitting ? "正在保存结果…" : "结果仍待保存，请重试交卷。"}</p><div className="exam-result-actions"><button className="secondary-button" disabled={!result.wrongCount} aria-pressed={wrongOnly} onClick={() => { const next = !wrongOnly; setWrongOnly(next); setIndex(next ? result.events.findIndex(event => !event.correct) : 0); }}>{wrongOnly ? "查看全部题目" : "只看错题"}</button><button className="secondary-button" onClick={onPractice}>返回练习</button><button className="primary-button" disabled={!resultSaved} onClick={() => setSetup(true)}>再测一次</button></div></div>}
      {!result && <div className="exam-progress"><span>已作答 {answeredCount} / {session.questions.length}</span><span role="status">{saving ? "正在保存…" : error ? "保存待重试" : "已保存到本机"}</span><button className="text-button" disabled={submitting} onClick={() => confirmation.current?.showModal()}>交卷</button></div>}
      {question && <article className="question-card"><div className="question-meta"><span className="question-type">{typeNames[question.type]}</span><span>测试第 {index + 1} 题 / {session.questions.length}</span></div><div className="question-prompt rich-text" dangerouslySetInnerHTML={{ __html: question.promptHtml }} />
        <div className="answer-options" aria-label="测试作答选项">{question.type === "fill" ? question.answer.map((_, answerIndex) => <label className="fill-answer" key={answerIndex}><span>第 {answerIndex + 1} 空</span><input value={response[answerIndex] ?? ""} disabled={!!result || submitting} autoComplete="off" onChange={event => { const next = question.answer.map((_, itemIndex) => response[itemIndex] ?? ""); next[answerIndex] = event.target.value; answer(next); }} /></label>) : question.options.map((option, optionIndex) => {
          const selected = response.includes(option.id);
          const right = !!result && question.answer.includes(option.id);
          const wrong = !!result && selected && !right;
          return <button key={option.id} className={`answer-option ${selected ? "selected" : ""} ${right ? "right" : ""} ${wrong ? "wrong" : ""}`} disabled={!!result || submitting} aria-pressed={selected} onClick={() => answer(question.type === "multiple" ? selected ? response.filter(id => id !== option.id) : [...response, option.id] : [option.id])}><span className="option-letter">{right ? <Check size={18} /> : wrong ? <X size={18} /> : String.fromCharCode(65 + optionIndex)}</span><span className="rich-text option-text" dangerouslySetInnerHTML={{ __html: option.textHtml }} /></button>;
        })}</div>
        {!result && <p className="exam-answer-hint">{question.type === "multiple" ? "多选题，请选出全部正确选项。" : ""}答案自动保存，交卷前可修改。</p>}
        {result && <section className={`answer-result ${currentResult?.correct ? "correct" : "incorrect"}`}><div className="result-heading"><span>{currentResult?.correct ? <CheckCircle2 size={20} /> : <X size={20} />}{currentResult?.correct ? "回答正确" : response.some(value => value.trim()) ? "回答错误" : "未作答"}</span></div><div className="standard-answer"><strong>原站答案</strong><div>{question.type === "fill" ? question.answer.join("；") : question.options.filter(option => question.answer.includes(option.id)).map(option => <div key={option.id} className="rich-text" dangerouslySetInnerHTML={{ __html: `${String.fromCharCode(65 + question.options.indexOf(option))}. ${option.textHtml}` }} />)}</div></div><div className="explanation"><h3>答案解析 <span>{question.explanationStatus === "original" ? "原站解析" : question.explanationStatus === "verified" ? "补充解析" : "待核实"}</span></h3>{question.explanationHtml ? <div className="rich-text" dangerouslySetInnerHTML={{ __html: question.explanationHtml }} /> : <p className="muted">这道题的解析尚待核实。</p>}{question.explanationSources.length > 0 && <ul className="sources">{question.explanationSources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></li>)}</ul>}</div></section>}
      </article>}
      <footer className="question-navigation"><button className="secondary-button" disabled={reviewIndexes.indexOf(index) <= 0} onClick={() => chooseQuestion(reviewIndexes[reviewIndexes.indexOf(index) - 1])}><ChevronLeft size={18} />上一题</button><span>{index + 1} / {session.questions.length}</span>{reviewIndexes.indexOf(index) < reviewIndexes.length - 1 ? <button className="primary-button" onClick={() => chooseQuestion(reviewIndexes[reviewIndexes.indexOf(index) + 1])}>下一题<ChevronRight size={18} /></button> : !result ? <button className="primary-button" disabled={submitting} onClick={() => confirmation.current?.showModal()}>交卷<Check size={18} /></button> : <button className="primary-button" onClick={onPractice}>返回练习</button>}</footer>
      <p className="page-footnote">{session.submittedAt ? "本次测试已结束" : "切换页面或进入后台仍会计时，刷新可恢复本次试卷。"}</p>
    </>}
    <dialog ref={drawer} className="question-drawer"><div className="drawer-heading"><h2>测试答题卡</h2><button className="icon-button" aria-label="关闭测试答题卡" onClick={() => drawer.current?.close()}><X size={22} /></button></div><p className="muted">{result ? wrongOnly ? "本场错题" : "绿色为答对，橙色为答错或未答" : "填色为已作答，点击题号可跳转"}</p>{numberGrid()}</dialog>
    <dialog ref={confirmation} className="exam-confirm"><h2>确认交卷？</h2><p>已作答 {answeredCount} 题，还有 {(session?.questions.length ?? 0) - answeredCount} 题未答。未答题记 0 分，交卷后不能修改本次答案。</p><div><button className="secondary-button" onClick={() => confirmation.current?.close()}>继续答题</button><button className="primary-button" disabled={submitting} onClick={() => void submit()}>确认交卷</button></div></dialog>
  </section>;
}
