"use client";

import React, { useState } from "react";
import Link from "next/link";
import { getPasscodeHeaders } from "@/lib/passcode";
import { AudioPlayer } from "@/components/audio-player";
import { toast } from "sonner";

type Category = "reading" | "listening" | "writing" | "grammar";

const CATEGORIES: { key: Category; label: string; icon: string; desc: string }[] = [
  { key: "reading", label: "Leseverstehen", icon: "\u{1F4D6}", desc: "Reading comprehension" },
  { key: "listening", label: "H\u00f6rverstehen", icon: "\u{1F3A7}", desc: "Listening comprehension" },
  { key: "writing", label: "Schriftlicher Ausdruck", icon: "\u270D\uFE0F", desc: "Written expression" },
  { key: "grammar", label: "Grammatik & Wortschatz", icon: "\u{1F4DD}", desc: "Grammar & vocabulary" },
];

interface QuestionData {
  type?: string;
  questions?: { q: string; options?: string[]; correct?: number; explanation?: string; }[];
  passage?: string;
  transcript?: string;
  prompt?: string;
  requirements?: string[];
  sampleAnswer?: string;
}
interface Question {
  q: string;
  options?: string[];
  correct?: number;
  explanation?: string;
  passage?: string;
  transcript?: string;
  prompt?: string;
  requirements?: string[];
  sampleAnswer?: string;
  type?: string;
}

export default function ExamPrepPage() {
  const [sel, setSel] = useState<Category | null>(null);
  const [data, setData] = useState<QuestionData | null>(null);
  const [loading, setLoading] = useState(false);
  const [ans, setAns] = useState<Record<number, number>>({});
  const [done, setDone] = useState(false);
  const [sub, setSub] = useState(false);

  async function load(cat: Category) {
    setSel(cat); setData(null); setAns({}); setDone(false); setSub(false); setLoading(true);
    try {
      const r = await fetch("/api/v1/exam-prep", { method: "POST", headers: { "Content-Type": "application/json", ...getPasscodeHeaders() }, body: JSON.stringify({ category: cat }) });
      if (!r.ok) throw new Error("Failed");
      setData((await r.json()).questions);
    } catch { toast.error("Failed to load questions."); }
    finally { setLoading(false); }
  }

  async function submit() {
    if (!data || !sel) return;
    setSub(true); setDone(true);
    const qs = data.questions || []; let ok = 0;
    for (let i = 0; i < qs.length; i++) {
      const c = ans[i] === qs[i]!.correct;
      if (c) ok++;
      try { await fetch("/api/v1/exam-prep", { method: "PATCH", headers: { "Content-Type": "application/json", ...getPasscodeHeaders() }, body: JSON.stringify({ category: sel, question: qs[i]!.q, userAnswer: qs[i]!.options?.[ans[i] ?? 0] ?? "none", correct: c, score: c ? 1 : 0 }) }); } catch {}
    }
    toast.success(ok + "/" + qs.length + " correct!");
  }

  function cls(qi: number, oi: number) {
    const s = ans[qi] === oi;
    const ok = sub && oi === (data?.questions || [])[qi]?.correct;
    const bad = sub && s && !ok;
    const b = "w-full rounded-xl border p-3 text-left text-sm transition-all ";
    if (ok) return b + "border-green-300 bg-green-50 text-green-800";
    if (bad) return b + "border-red-300 bg-red-50 text-red-800";
    if (s) return b + "border-orange-300 bg-orange-50 text-orange-800";
    return b + "border-zinc-200 text-zinc-700 hover:border-orange-200 hover:bg-orange-50/50";
  }

  const qs = data?.questions ?? [];

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50 to-amber-50/30">
      <header className="sticky top-0 z-10 border-b border-orange-100 bg-white/80 backdrop-blur-sm px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <Link href="/" className="flex items-center space-x-2 text-sm text-zinc-600 hover:text-zinc-900">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
            <span>Back</span>
          </Link>
          <h1 className="text-lg font-semibold"><span className="text-orange-600">B2</span> <span className="text-zinc-900">Exam Prep</span></h1>
          <div className="w-12" />
        </div>
      </header>
      <div className="mx-auto max-w-2xl px-4 py-6">
        {!sel ? (
          <div className="space-y-4">
            <div className="text-center"><p className="text-4xl">{"\u{1F3AF}"}</p>
              <h2 className="mt-3 text-xl font-bold text-zinc-900">Goethe B2 Practice</h2>
              <p className="mt-1 text-sm text-zinc-500">Choose a section to practice</p></div>
            <div className="grid grid-cols-2 gap-3 mt-6">
              {CATEGORIES.map((c) => (
                <button key={c.key} onClick={() => load(c.key)} className="group rounded-2xl border border-orange-100 bg-white p-5 text-left shadow-sm transition-all hover:border-orange-300 hover:shadow-md active:scale-[0.98]">
                  <span className="text-3xl">{c.icon}</span>
                  <p className="mt-3 font-semibold text-zinc-900">{c.label}</p>
                  <p className="mt-1 text-xs text-zinc-500">{c.desc}</p>
                </button>))}
            </div></div>
        ) : loading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-orange-200 border-t-orange-600" />
            <p className="mt-4 text-sm text-zinc-500">Generating B2 questions...</p></div>
        ) : data ? (
          <div className="space-y-6">
            <button onClick={() => { setSel(null); setData(null); setAns({}); setDone(false); setSub(false); }} className="text-sm text-orange-600 hover:text-orange-700">{"\u2190"} Change section</button>
            {data.passage && <div className="rounded-2xl border border-orange-100 bg-white p-6 shadow-sm"><h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-orange-600">Text</h3><p className="whitespace-pre-line text-sm leading-relaxed text-zinc-700">{data.passage}</p></div>}
            {data.transcript && <div className="rounded-2xl border border-orange-100 bg-white p-6 shadow-sm"><h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-orange-600">Transcript</h3><p className="whitespace-pre-line text-sm leading-relaxed text-zinc-700">{data.transcript}</p><div className="mt-3"><AudioPlayer text={data.transcript} /></div></div>}
            {data.prompt && <div className="rounded-2xl border border-orange-100 bg-white p-6 shadow-sm"><h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-orange-600">Writing Task</h3><p className="text-sm font-medium text-zinc-900">{data.prompt}</p>{data.requirements && <ul className="mt-3 space-y-1">{data.requirements.map((r, i) => <li key={i} className="text-xs text-zinc-600">{"\u2022"} {r}</li>)}</ul>}{done && data.sampleAnswer && <div className="mt-4 rounded-xl bg-green-50 p-4"><p className="text-xs font-semibold text-green-700">Sample Answer:</p><p className="mt-1 text-sm text-green-800">{data.sampleAnswer}</p></div>}</div>}
            {qs.map((q, qi) => (
              <div key={qi} className="rounded-2xl border border-orange-100 bg-white p-6 shadow-sm">
                <p className="text-sm font-medium text-zinc-900">{qi + 1}. {q.q}</p>
                {q.options && <div className="mt-4 space-y-2">{q.options.map((opt, oi) => (
                  <button key={oi} onClick={() => !sub && setAns({...ans, [qi]: oi})} disabled={sub} className={cls(qi, oi)}>{opt}</button>
                ))}</div>}
                {done && q.explanation && <div className="mt-3 rounded-xl bg-blue-50 p-3"><p className="text-xs text-blue-700">{q.explanation}</p></div>}
              </div>))}
            {!sub ? <button onClick={submit} disabled={Object.keys(ans).length === 0} className="w-full rounded-xl bg-orange-600 px-6 py-3 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50">Check Answers</button>
            : <button onClick={() => load(sel)} className="w-full rounded-xl bg-orange-600 px-6 py-3 text-sm font-medium text-white hover:bg-orange-700">New Questions</button>}
          </div>) : null}
      </div>
    </div>
  );
}
