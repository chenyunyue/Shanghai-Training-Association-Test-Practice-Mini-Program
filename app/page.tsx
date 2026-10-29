"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Cloud, List, RefreshCw, WifiOff, X } from "lucide-react";
import { downloadQuestionBank, getCachedQuestionBank, type Question, type QuestionBank } from "../lib/question-bank";
import { getLocalAnswerEvents, saveAnswerEvent, syncAnswerEvents, type StoredAnswerEvent } from "../lib/offline-events";
import { getWrongQuestionIds } from "../lib/wrong-book";

const typeNames = { single: "单选题", multiple: "多选题", judge: "判断题", fill: "填空题" };

function clock(seconds: number) {
  return `${Math.floor(seconds / 3600).toString().padStart(2, "0")}:${Math.floor(seconds / 60 % 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}

function QuestionCard({ question, latest, onAnswer }: {
  question: Question;
  latest?: StoredAnswerEvent;
  onAnswer: (question: Question, response: string[]) => Promise<StoredAnswerEvent>;
}) {
  const [selected, setSelected] = useState<string[]>(latest?.response ?? []);
  const [result, setResult] = useState<StoredAnswerEvent | undefined>(latest);
  const [editing, setEditing] = useState(!latest);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!editing && latest) { setResult(latest); setSelected(latest.response); }
  }, [latest, editing]);

  async function answer(response: string[]) {
    setSelected(response); setSaving(true); setError("");
    try {
      const event = await onAnswer(question, response);
      setResult(event); setEditing(false);
    } catch { setError("作答尚未保存，请重试。若浏览器存储已满，请先留在本页处理。"); }
    finally { setSaving(false); }
  }
  const isFill = question.type === "fill";
  const canConfirm = isFill ? question.answer.every((_, index) => selected[index]?.trim()) : selected.length > 0;

  return <article className="question-card">
    <div className="question-meta"><span className="question-type">{typeNames[question.type]}</span><span>第 {question.number} 题</span></div>
    <div className="question-prompt rich-text" dangerouslySetInnerHTML={{ __html: question.promptHtml }} />
    <div className="answer-options" aria-label="作答选项">
      {isFill ? question.answer.map((_, index) => <label className="fill-answer" key={index}>
        <span>第 {index + 1} 空</span><input value={selected[index] ?? ""} disabled={!!result || saving} onChange={event => { const next = [...selected]; next[index] = event.target.value; setSelected(next); }} autoComplete="off" />
      </label>) : question.options.map((option, index) => {
        const chosen = selected.includes(option.id);
        const right = !!result && question.answer.includes(option.id);
        const wrong = !!result && chosen && !right;
        return <button key={option.id} type="button" className={`answer-option ${chosen ? "selected" : ""} ${right ? "right" : ""} ${wrong ? "wrong" : ""}`} disabled={!!result || saving} aria-pressed={chosen}
          onClick={() => question.type === "multiple" ? setSelected(chosen ? selected.filter(id => id !== option.id) : [...selected, option.id]) : void answer([option.id])}>
          <span className="option-letter">{right ? <Check size={18} /> : wrong ? <X size={18} /> : String.fromCharCode(65 + index)}</span><span className="rich-text option-text" dangerouslySetInnerHTML={{ __html: option.textHtml }} />
        </button>;
      })}
    </div>
    {!result && (question.type === "multiple" || isFill) && <button type="button" className="primary-button confirm-answer" disabled={!canConfirm || saving} onClick={() => void answer(selected)}>{saving ? "正在保存…" : "确认答案"}</button>}
    {error && <p className="inline-error" role="alert">{error}</p>}
    {result && <section className={`answer-result ${result.correct ? "correct" : "incorrect"}`} aria-live="polite">
      <div className="result-heading"><span>{result.correct ? <CheckCircle2 size={21} /> : <X size={21} />}{result.correct ? "回答正确" : "回答错误"}</span><button className="text-button" onClick={() => { setResult(undefined); setSelected([]); setEditing(true); }}>重新作答</button></div>
      <p className="result-caption">{result.correct ? "本题不在错题本中，可继续下一题。" : "已记入错题本，之后答对会自动移出。"}</p>
      <div className="standard-answer"><strong>标准答案</strong><div>{isFill ? question.answer.join("；") : question.options.filter(option => question.answer.includes(option.id)).map(option => <div className="rich-text" key={option.id} dangerouslySetInnerHTML={{ __html: `${String.fromCharCode(65 + question.options.indexOf(option))}. ${option.textHtml}` }} />)}</div></div>
      <div className="explanation"><h3>答案解析 <span>{question.explanationStatus === "original" ? "原站解析" : question.explanationStatus === "verified" ? "补充解析" : "待核实"}</span></h3>
        {question.explanationHtml ? <div className="rich-text" dangerouslySetInnerHTML={{ __html: question.explanationHtml }} /> : <p className="muted">这道题的解析尚待核实。</p>}
        {question.explanationSources.length > 0 && <ul className="sources">{question.explanationSources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></li>)}</ul>}
      </div>
    </section>}
  </article>;
}

export default function Home() {
  const [bank, setBank] = useState<QuestionBank | null>(null);
  const [events, setEvents] = useState<StoredAnswerEvent[]>([]);
  const [moduleId, setModuleId] = useState("");
  const [questionId, setQuestionId] = useState("");
  const [mode, setMode] = useState<"practice" | "wrong">("practice");
  const [loading, setLoading] = useState(true);
  const [bankError, setBankError] = useState("");
  const [online, setOnline] = useState(true);
  const [syncState, setSyncState] = useState<"pending" | "syncing" | "synced">("pending");
  const [seconds, setSeconds] = useState(0);
  const drawer = useRef<HTMLDialogElement>(null);
  const syncQueue = useRef(Promise.resolve());

  const sync = useCallback(() => {
    if (!navigator.onLine) return;
    setSyncState("syncing");
    syncQueue.current = syncQueue.current.then(async () => {
      try { setEvents(await syncAnswerEvents()); setSyncState("synced"); }
      catch { setSyncState("pending"); }
    });
  }, []);
  const refreshBank = useCallback(async () => {
    if (!navigator.onLine) return;
    try { setBank(await downloadQuestionBank()); setBankError(""); }
    catch (error) { setBankError(error instanceof Error ? error.message : "题库下载失败。"); }
  }, []);

  useEffect(() => {
    setOnline(navigator.onLine);
    Promise.all([getCachedQuestionBank(), getLocalAnswerEvents()]).then(([cachedBank, savedEvents]) => { setBank(cachedBank); setEvents(savedEvents); })
      .catch(() => setBankError("无法读取本地存储，请检查浏览器是否允许此网站保存数据。"))
      .finally(() => { setLoading(false); void refreshBank(); sync(); });
    const onOnline = () => { setOnline(true); void refreshBank(); sync(); };
    const onOffline = () => { setOnline(false); setSyncState("pending"); };
    const onVisible = () => { if (document.visibilityState === "visible") sync(); };
    window.addEventListener("online", onOnline); window.addEventListener("offline", onOffline); document.addEventListener("visibilitychange", onVisible);
    return () => { window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); document.removeEventListener("visibilitychange", onVisible); };
  }, [refreshBank, sync]);

  const latest = useMemo(() => {
    const map = new Map<string, StoredAnswerEvent>();
    for (const event of events) {
      const previous = map.get(event.questionId);
      if (!previous || event.answeredAt > previous.answeredAt || (event.answeredAt === previous.answeredAt && event.id > previous.id)) map.set(event.questionId, event);
    }
    return map;
  }, [events]);
  const wrongIds = useMemo(() => getWrongQuestionIds(events), [events]);
  const activeModule = bank?.modules.find(module => module.id === moduleId) ?? bank?.modules[0];
  const questions = activeModule?.questions ?? [];
  const listedQuestions = mode === "wrong" ? questions.filter(question => wrongIds.has(question.id)) : questions;
  const question = questions.find(item => item.id === questionId) ?? listedQuestions.find(item => !latest.has(item.id)) ?? listedQuestions[0];
  const answeredCount = questions.filter(item => latest.has(item.id)).length;
  const moduleWrongCount = questions.filter(item => wrongIds.has(item.id)).length;
  const totalQuestions = bank?.modules.reduce((sum, module) => sum + module.questions.length, 0) ?? 0;

  useEffect(() => {
    if (!question) return;
    const timer = window.setInterval(() => setSeconds(value => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [!!question]);

  function chooseModule(id: string) { setModuleId(id); setQuestionId(""); setSeconds(0); drawer.current?.close(); }
  function chooseQuestion(id: string) { setQuestionId(id); drawer.current?.close(); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function navigate(direction: number) {
    if (!question || !listedQuestions.length) return;
    const index = listedQuestions.findIndex(item => item.id === question.id);
    if (index >= 0) chooseQuestion(listedQuestions[(index + direction + listedQuestions.length) % listedQuestions.length].id);
    else {
      const ordered = direction > 0 ? listedQuestions : [...listedQuestions].reverse();
      chooseQuestion((ordered.find(item => direction > 0 ? item.number > question.number : item.number < question.number) ?? ordered[0]).id);
    }
  }
  async function answerQuestion(item: Question, response: string[]) {
    const correct = item.type === "fill" ? response.length === item.answer.length && response.every((value, index) => value.trim() === item.answer[index].trim()) : response.length === item.answer.length && response.every(value => item.answer.includes(value));
    const event = { id: crypto.randomUUID(), questionId: item.id, response, correct, answeredAt: new Date().toISOString() };
    await saveAnswerEvent(event);
    setQuestionId(item.id); setEvents(current => [...current, event]); setSyncState("pending"); sync();
    return event;
  }
  function numberGrid() {
    return <><div className="number-grid">{listedQuestions.map(item => <button key={item.id} onClick={() => chooseQuestion(item.id)} aria-label={`第 ${item.number} 题${latest.has(item.id) ? latest.get(item.id)?.correct ? "，已答对" : "，已答错" : "，未作答"}`} aria-current={question?.id === item.id ? "step" : undefined} className={`${latest.has(item.id) ? latest.get(item.id)?.correct ? "done-right" : "done-wrong" : ""} ${question?.id === item.id ? "current" : ""}`}>{item.number}</button>)}</div><div className="question-legend"><span><i />未作答</span><span><i className="green" />答对</span><span><i className="rose" />答错</span></div></>;
  }

  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="/" aria-label="个人练习室首页"><span className="brand-icon"><BookOpen size={22} /></span><span>个人练习室<small>专注每一次进步</small></span></a><div className="session-time"><Clock3 size={17} /><span>{clock(seconds)}</span></div><button className={`sync-status ${!online ? "offline" : syncState}`} onClick={sync} disabled={!online || syncState === "syncing"} title={!online ? "本地保存，联网后自动同步" : "点击同步练习记录"}>{!online ? <WifiOff size={16} /> : syncState === "syncing" ? <RefreshCw size={16} className="spinning" /> : <Cloud size={16} />}<span>{!online ? "离线练习" : syncState === "syncing" ? "同步中" : syncState === "synced" ? "已同步" : "待同步"}</span></button></header>
    <div className="workspace">
      <aside className="module-sidebar"><p className="eyebrow">我的题库</p><h2>一步一步，学扎实。</h2><p className="sidebar-intro">从一次练习开始，<br />把错题变成掌握的知识。</p><nav aria-label="练习模块">{bank?.modules.map(module => <button key={module.id} onClick={() => chooseModule(module.id)} className={activeModule?.id === module.id ? "active" : ""}><span>{module.name}</span><small>{module.questions.length}</small></button>)}</nav><div className="sidebar-note"><CheckCircle2 size={16} /><span>{totalQuestions ? `已缓存 ${totalQuestions} 道题` : "等待导入题库"}</span></div></aside>
      <main className="practice-main">
        <div className="practice-toolbar"><div className="module-title"><span className="eyebrow">{mode === "wrong" ? "针对性复习" : "顺序练习"}</span><h1>{activeModule?.name ?? "开始你的练习"}</h1><label className="mobile-module"><span className="sr-only">选择练习模块</span><select value={activeModule?.id ?? ""} onChange={event => chooseModule(event.target.value)} disabled={!bank?.modules.length}>{!bank?.modules.length && <option value="">尚未导入题库</option>}{bank?.modules.map(module => <option key={module.id} value={module.id}>{module.name}</option>)}</select></label></div><button className="question-drawer-button" onClick={() => drawer.current?.showModal()} disabled={!questions.length}><List size={18} />题号</button><div className="progress-summary"><strong>{answeredCount}<span> / {questions.length}</span></strong><small>已完成</small></div></div>
        <div className="mode-row"><div className="mode-tabs" aria-label="练习模式"><button aria-pressed={mode === "practice"} className={mode === "practice" ? "active" : ""} onClick={() => { setMode("practice"); setQuestionId(""); }}>全部练习</button><button aria-pressed={mode === "wrong"} className={mode === "wrong" ? "active" : ""} onClick={() => { setMode("wrong"); setQuestionId(""); }}>错题本 <span>{moduleWrongCount}</span></button></div><div className="progress-track" role="progressbar" aria-label="模块作答进度" aria-valuenow={answeredCount} aria-valuemax={questions.length || 1}><span style={{ width: `${questions.length ? answeredCount / questions.length * 100 : 0}%` }} /></div></div>
        {bankError && <p className="notice" role="status">{bankError}{bank && " 已下载的题库仍可继续使用。"}<button onClick={() => void refreshBank()} disabled={!online}>重试下载</button>{online && <a href="/signin-with-chatgpt?return_to=%2F" target="_top">重新登录</a>}</p>}
        {loading ? <section className="empty-state" role="status"><RefreshCw className="spinning" size={28} /><h2>正在准备练习</h2><p>读取本地题库和练习记录…</p></section>
          : question ? <><QuestionCard key={`${mode}:${question.id}`} question={question} latest={mode === "wrong" ? undefined : latest.get(question.id)} onAnswer={answerQuestion} /><footer className="question-navigation"><button className="secondary-button" onClick={() => navigate(-1)} disabled={!listedQuestions.length}><ChevronLeft size={18} />上一题</button><span>{mode === "wrong" ? `还剩 ${moduleWrongCount} 道错题` : `${question.number} / ${questions.length}`}</span>{mode === "wrong" && !moduleWrongCount ? <button className="primary-button" onClick={() => { setMode("practice"); setQuestionId(""); }}>完成复习<Check size={18} /></button> : <button className="primary-button" onClick={() => navigate(1)} disabled={!listedQuestions.length}>下一题<ChevronRight size={18} /></button>}</footer></>
          : <section className="empty-state"><span className="empty-icon">{mode === "wrong" && questions.length ? <CheckCircle2 size={32} /> : <BookOpen size={32} />}</span><h2>{mode === "wrong" && questions.length ? "这个模块没有错题" : online ? "题库尚未导入" : "这台设备尚未下载题库"}</h2><p>{mode === "wrong" && questions.length ? "继续练习，答错的题会自动出现在这里。" : online ? "完整题目与解析核验后会在这里显示。" : "请首次联网登录并下载题库，然后就可以离线练习。"}</p>{mode === "wrong" && questions.length ? <button className="primary-button" onClick={() => setMode("practice")}>回到全部练习</button> : <button className="secondary-button" onClick={() => void refreshBank()} disabled={!online}>刷新题库</button>}</section>}
        <p className="page-footnote">{bank ? `题库版本 ${bank.version} · 本地保存，联网同步` : "首次联网下载题库后，可离线练习"}</p>
      </main>
      <aside className="question-sidebar"><div className="sidebar-heading"><h2>题目列表</h2><span>{listedQuestions.length} 题</span></div>{numberGrid()}</aside>
    </div>
    <dialog ref={drawer} className="question-drawer"><div className="drawer-heading"><h2>题目列表</h2><button className="icon-button" aria-label="关闭题号列表" onClick={() => drawer.current?.close()}><X size={22} /></button></div><p className="muted">{activeModule?.name} · {listedQuestions.length} 题</p>{numberGrid()}</dialog>
  </div>;
}
