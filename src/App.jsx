import { useEffect, useMemo, useState } from "react";
import {
  BookOpen, CheckCircle2, CircleAlert, FileText, KeyRound, LoaderCircle,
  Download, LogOut, RefreshCw, Search, ShieldCheck, UserRound, X, XCircle, ChevronLeft, ChevronRight
} from "lucide-react";

const API_ROOT = "/api";

async function apiRequest(url, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {})
      }
    });
  } catch {
    throw new Error(
      "Could not reach the response service. Check your internet connection. If this persists, the server may block browser requests (CORS); use an approved backend proxy rather than disabling browser security."
    );
  }

  const raw = await response.text();
  let data;
  try { data = raw ? JSON.parse(raw) : {}; }
  catch { throw new Error(`The API returned an unexpected response (HTTP ${response.status}).`); }

  if (!response.ok) {
    throw new Error(data?.sdesc || data?.message || `Request failed (HTTP ${response.status}).`);
  }
  if (data?.status === false) {
    throw new Error(data?.sdesc || data?.message || "The API could not complete the request.");
  }
  return data;
}

function getRows(payload) {
  // Supports either the documented { data: [...] } response or an array directly.
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}
function getDetails(payload) {
  if (payload?.data && !Array.isArray(payload.data)) return payload.data;
  return payload?.data || {};
}
function firstValue(obj, ...keys) {
  for (const key of keys) {
    const value = obj?.[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return "—";
}
function safeText(value) {
  if (value === undefined || value === null || value === "") return "—";
  return String(value);
}

const QUESTION_IMAGE_ROOT = "https://api.apdsc.apcfss.in/dscdms/user-defined-path/file-download/bucket/documents.apdsc.apcfss.in/SPL_TET_QUESTION_IMAGES/";

function getQuestionContent(value, cleanQuestionPath) {
  const raw = String(value ?? "").trim();
  const imageTag = raw.match(/<img\b[^>]*>/i)?.[0] || "";
  const src = imageTag.match(/\bsrc=["']([^"']+)["']/i)?.[1];
  const namedFile = imageTag.match(/\bname=["']([^"']+)["']/i)?.[1];
  const cleanPath = String(cleanQuestionPath ?? "").trim().replace(/^\/+/, "");
  let imageUrl = null;

  // The API's clean question path is authoritative; it contains the correct
  // filename (for example Q26_...jpg), unlike the legacy tkcimages filename.
  const cleanFilename = cleanPath.split(/[?#]/)[0].split("/").pop();
  if (cleanFilename && /^[A-Za-z0-9_.-]+\.(?:jpe?g|png|gif|webp)$/i.test(cleanFilename)) {
    imageUrl = QUESTION_IMAGE_ROOT + encodeURIComponent(cleanFilename);
  } else {
    const candidate = [namedFile, src].find((item) => item && /(?:^|\/)Q\d+_/i.test(item)) || namedFile || src || "";
    if (candidate.startsWith("data:")) imageUrl = candidate;
    else if (candidate) {
      if (/^https?:\/\//i.test(candidate) && candidate.includes("/dscdms/user-defined-path/file-download/bucket/")) {
        imageUrl = candidate;
      } else {
        const filename = candidate.split(/[?#]/)[0].split("/").pop();
        if (filename && /^[A-Za-z0-9_.-]+\.(?:jpe?g|png|gif|webp)$/i.test(filename)) {
          imageUrl = QUESTION_IMAGE_ROOT + encodeURIComponent(filename);
        }
      }
    }
  }
  const text = raw.replace(/<img\b[^>]*>/gi, "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").trim();
  return { text, imageUrl };
}

function QuestionContent({ value, cleanQuestionPath }) {
  const { text, imageUrl } = getQuestionContent(value, cleanQuestionPath);
  return <div className="question-content-rendered">
    {text && <p>{text}</p>}
    {imageUrl && <img className="question-illustration" src={imageUrl} alt="Question illustration" loading="lazy" onError={(event) => { event.currentTarget.style.display = "none"; }} />}
    {!text && !imageUrl && <p>Question text or image is not available in the response.</p>}
  </div>;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>\"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function printableQuestionHtml(q, index) {
  const questionValue = firstValue(q, "Question Text", "Question", "Question Description", "Question Content", "QUESTION");
  const content = getQuestionContent(questionValue === "—" ? "" : questionValue, q["clean question path"]);
  const result = safeText(q["Result"]);
  const image = content.imageUrl ? `<img class="q-image" src="${escapeHtml(content.imageUrl)}" alt="Question illustration">` : "";
  return `<article class="question"><div class="q-head"><strong>Question ${escapeHtml(firstValue(q, "Question Sr No") === "—" ? index + 1 : firstValue(q, "Question Sr No"))}</strong><span>${escapeHtml(firstValue(q, "Section Name"))}</span></div><div class="q-body">${content.text ? `<p>${escapeHtml(content.text)}</p>` : ""}${image || (!content.text ? `<p class="muted">Question text/image not available.</p>` : "")}</div><div class="answers"><div><b>Your answer</b><span>${escapeHtml(firstValue(q, "Selected Option Text", "Selected Option Number", "Selected Option"))}</span></div><div><b>Correct answer</b><span>${escapeHtml(firstValue(q, "Correct Option Text", "Correct Option Number", "Correct Option"))}</span></div><div><b>Result</b><span>${escapeHtml(result)}</span></div><div><b>Marks</b><span>${escapeHtml(firstValue(q, "Score", "Marks Awarded", "Marks"))}</span></div></div></article>`;
}

export default function App() {
  const [captcha, setCaptcha] = useState(null);
  const [candidateId, setCandidateId] = useState("");
  const [password, setPassword] = useState("");
  const [captchaText, setCaptchaText] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingCaptcha, setLoadingCaptcha] = useState(false);
  const [error, setError] = useState("");
  const [candidate, setCandidate] = useState(null);
  const [exams, setExams] = useState([]);
  const [selectedExamId, setSelectedExamId] = useState("");
  const [details, setDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [selectedQuestion, setSelectedQuestion] = useState(null);

  const participant = useMemo(() => {
    const rows = details?.["Participant Details"];
    return Array.isArray(rows) ? rows[0] || {} : {};
  }, [details]);

  const questions = useMemo(() => {
    const rows = details?.["Question Wise Details"];
    return Array.isArray(rows) ? rows : [];
  }, [details]);

  const visibleQuestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return questions.filter((item) => {
      const result = safeText(item["Result"]);
      const matchesFilter = filter === "All" || result.toLowerCase() === filter.toLowerCase();
      const searchable = [
        item["Question Sr No"], item["Section Name"], item["Question ID"],
        item["Question Text"], item["Selected Option Text"], item["Correct Option Text"], result
      ].map(safeText).join(" ").toLowerCase();
      return matchesFilter && (!q || searchable.includes(q));
    });
  }, [questions, query, filter]);

  async function loadCaptcha() {
    setError("");
    setLoadingCaptcha(true);
    setCaptchaText("");
    try {
      const data = await apiRequest(`${API_ROOT}/emptetapi/dsc-public/generate-captcha`, {
        method: "POST",
        body: JSON.stringify({})
      });
      if (!data?.captcha || !data?.captchaId) {
        throw new Error("CAPTCHA response did not include both captcha and captchaId.");
      }
      setCaptcha({ image: data.captcha, id: data.captchaId });
    } catch (e) {
      setCaptcha(null);
      setError(e.message || "Could not generate CAPTCHA.");
    } finally {
      setLoadingCaptcha(false);
    }
  }

  useEffect(() => { loadCaptcha(); }, []);

  useEffect(() => {
    if (!selectedQuestion) return;
    function handleModalKeys(event) {
      if (event.key === "Escape") setSelectedQuestion(null);
      const currentIndex = questions.indexOf(selectedQuestion);
      if (event.key === "ArrowLeft" && currentIndex > 0) setSelectedQuestion(questions[currentIndex - 1]);
      if (event.key === "ArrowRight" && currentIndex >= 0 && currentIndex < questions.length - 1) setSelectedQuestion(questions[currentIndex + 1]);
    }
    window.addEventListener("keydown", handleModalKeys);
    return () => window.removeEventListener("keydown", handleModalKeys);
  }, [selectedQuestion, questions]);

  async function signIn(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const auth = await apiRequest(`${API_ROOT}/emptetapi/auth/candidate-authenticate`, {
        method: "POST",
        body: JSON.stringify({
          username: candidateId.trim(),
          password,
          captcha: captchaText.trim(),
          captchaId: captcha?.id
        })
      });
      if (!auth?.access_token) {
        throw new Error(auth?.sdesc || "Login response did not contain an access token.");
      }
      const token = auth.access_token;
      const abstract = await apiRequest(`${API_ROOT}/emptetreadapi/tet-response-sheet-abstract`, {
        method: "GET",
        headers: { Authorization: `${auth.token_type || "Bearer"} ${token}` }
      });
      const rows = getRows(abstract);
      setCandidate({ token, tokenType: auth.token_type || "Bearer", name: "", auth });
      setExams(rows);
      setDetails(null);
      setSelectedExamId(rows[0]?.exam_id || "");
      setPassword("");
      if (!rows.length) {
        setError("Login succeeded, but no response-sheet exams were returned for this account.");
      }
      // Keep token only in component memory. It is never written to localStorage/sessionStorage.
    } catch (e) {
      setError(e.message || "Login failed. Check your details and try again.");
      // CAPTCHA values are usually single-use; refresh after an authentication failure.
      await loadCaptcha();
    } finally {
      setBusy(false);
    }
  }

  async function loadExam(examId, tokenOverride) {
    if (!examId || !(tokenOverride || candidate?.token)) return;
    setError("");
    setLoadingDetails(true);
    setSelectedExamId(examId);
    try {
      const token = tokenOverride || candidate.token;
      const result = await apiRequest(
        `${API_ROOT}/emptetreadapi/tet-response-sheet-stream?examId=${encodeURIComponent(examId)}`,
        { method: "GET", headers: { Authorization: `${candidate?.tokenType || "Bearer"} ${token}` } }
      );
      setDetails(getDetails(result));
    } catch (e) {
      setDetails(null);
      setError(e.message || "Could not load this response sheet.");
    } finally {
      setLoadingDetails(false);
    }
  }

  // Load the first exam after login; effect also handles switching exams.
  useEffect(() => {
    if (candidate?.token && selectedExamId && !details && !loadingDetails) {
      loadExam(selectedExamId, candidate.token);
    }
    // Intentionally keyed to exam selection/login state; loadExam guards missing values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidate?.token, selectedExamId, details, loadingDetails]);

  function downloadResponseSheetPdf() {
    if (!questions.length) return;
    const exam = exams.find((item) => String(item.exam_id) === String(selectedExamId)) || {};
    const title = `${safeText(firstValue(participant, "Subject"))} Response Sheet`;
    const questionHtml = questions.map((question, index) => printableQuestionHtml(question, index)).join("\n");
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setError("Your browser blocked the PDF window. Allow pop-ups for this site and try again.");
      return;
    }
    const doc = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
      @page{size:A4;margin:14mm 13mm}*{box-sizing:border-box}body{font:10pt Arial,sans-serif;color:#202b3c;margin:0}h1{font-size:19pt;margin:0 0 5px} .meta{font-size:9pt;color:#526078;line-height:1.5;margin-bottom:14px}.summary{display:flex;gap:18px;flex-wrap:wrap;padding:10px 12px;border:1px solid #d9e0eb;border-radius:7px;margin-bottom:17px}.summary span{font-size:9pt}.question{break-inside:avoid;border:1px solid #d8dee8;border-radius:7px;margin:0 0 7px;padding:7px 9px}.q-head{display:flex;justify-content:space-between;gap:12px;padding-bottom:4px;border-bottom:1px solid #e6eaf0;font-size:10pt}.q-head span{color:#66748a;font-size:9pt}.q-body{padding:5px 0;font-size:9pt;line-height:1.35;overflow-wrap:anywhere}.q-body p{margin:0 0 7px;white-space:pre-wrap}.q-image{display:block;max-width:100%;max-height:125px;width:auto;object-fit:contain;object-position:left center;margin:4px auto 0}.answers{display:grid;grid-template-columns:1fr 1fr;gap:5px}.answers div{border:1px solid #e5e9ef;border-radius:5px;padding:5px;min-width:0}.answers b{display:block;font-size:7.5pt;text-transform:uppercase;letter-spacing:.4px;color:#6b778b;margin-bottom:4px}.answers span{display:block;font-size:9pt;line-height:1.4;overflow-wrap:anywhere}.muted{color:#758198;font-style:italic}.footer{margin-top:14px;padding-top:8px;border-top:1px solid #e3e8ef;color:#788397;font-size:8pt}@media print{.question{break-inside:avoid}img{print-color-adjust:exact}} 
    </style></head><body><h1>${escapeHtml(title)}</h1><div class="meta">Exam date: ${escapeHtml(firstValue(exam, "exam_date"))} &nbsp;·&nbsp; Shift: ${escapeHtml(firstValue(exam, "shift"))} &nbsp;·&nbsp; Exam time: ${escapeHtml(firstValue(exam, "exam_time"))}<br>Candidate: ${escapeHtml(firstValue(participant, "Name"))} &nbsp;·&nbsp; Subject: ${escapeHtml(firstValue(participant, "Subject"))}</div><div class="summary"><span><b>Score:</b> ${escapeHtml(firstValue(participant, "Score"))} / ${escapeHtml(firstValue(participant, "Maximum Marks", "Total Questions"))}</span><span><b>Correct:</b> ${escapeHtml(firstValue(participant, "Total Correct"))}</span><span><b>Wrong:</b> ${escapeHtml(firstValue(participant, "Total Wrong"))}</span><span><b>Total questions:</b> ${questions.length}</span></div>${questionHtml}<div class="footer">Generated from the response sheet currently displayed. Includes all ${questions.length} questions; search and filters do not affect this PDF.</div><script>window.addEventListener('load',function(){const imgs=[...document.images];Promise.all(imgs.map(img=>img.complete?Promise.resolve():new Promise(resolve=>{img.onload=resolve;img.onerror=resolve;setTimeout(resolve,8000)}))).then(()=>setTimeout(()=>window.print(),250));});</script></body></html>`;
    printWindow.document.open();
    printWindow.document.write(doc);
    printWindow.document.close();
  }

  function logout() {
    setCandidate(null);
    setExams([]);
    setSelectedExamId("");
    setDetails(null);
    setCandidateId("");
    setPassword("");
    setCaptchaText("");
    setCaptcha(null);
    setQuery("");
    setFilter("All");
    setSelectedQuestion(null);
    setError("");
    loadCaptcha();
  }

  const total = Number(firstValue(participant, "Maximum Marks", "Total Questions")) || questions.length;
  const score = Number(firstValue(participant, "Score"));
  const correct = Number(firstValue(participant, "Total Correct"));
  const wrong = Number(firstValue(participant, "Total Wrong"));
  const scorePercent = total > 0 && Number.isFinite(score) ? Math.max(0, Math.min(100, (score / total) * 100)) : 0;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark"><BookOpen size={23} /></div>
        <div className="brand-copy">
          <span className="eyebrow">CANDIDATE PORTAL</span>
          <strong>Response Sheet Viewer</strong>
        </div>
        <div className="secure-label"><ShieldCheck size={16} /> Secure session</div>
      </header>

      <section className="page-intro">
        <div className="intro-tag">CANDIDATE PORTAL</div>
        <h1>{candidate ? "Your exam performance" : "View your response sheet"}</h1>
        <p>{candidate ? "Review your score and check each answer against the official response sheet." : "Sign in with your candidate credentials to view your official exam responses and score."}</p>
      </section>

      {error && <div className="alert" role="alert"><CircleAlert size={19} /><span>{error}</span><button className="icon-button" onClick={() => setError("")} aria-label="Dismiss error"><XCircle size={17}/></button></div>}

      {!candidate ? (
        <section className="login-card">
          <div className="card-heading">
            <div className="heading-icon"><KeyRound size={21}/></div>
            <div><h2>Candidate login</h2><p>Enter the details associated with your candidate account.</p></div>
          </div>
          <form onSubmit={signIn} className="login-form">
            <label htmlFor="candidateId">Candidate ID / Username</label>
            <div className="input-wrap"><UserRound size={18}/><input id="candidateId" autoComplete="username" value={candidateId} onChange={(e) => setCandidateId(e.target.value)} placeholder="Enter your candidate ID" required /></div>

            <label htmlFor="password">Password</label>
            <div className="input-wrap"><KeyRound size={18}/><input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" required /></div>

            <div className="captcha-label-row"><label htmlFor="captchaText">Security verification</label><span>Enter the characters shown</span></div>
            <div className="captcha-panel">
              <div className="captcha-image">
                {loadingCaptcha ? <LoaderCircle className="spin" size={24}/> : captcha?.image ? <img src={captcha.image} alt="CAPTCHA challenge" /> : <span>CAPTCHA unavailable</span>}
              </div>
              <button className="refresh-button" type="button" onClick={loadCaptcha} disabled={loadingCaptcha} aria-label="Refresh CAPTCHA"><RefreshCw size={17}/><span>Refresh</span></button>
            </div>
            <input id="captchaText" className="captcha-input" value={captchaText} onChange={(e) => setCaptchaText(e.target.value)} placeholder="Type CAPTCHA characters" autoComplete="off" required />

            <button className="primary-button" type="submit" disabled={busy || loadingCaptcha || !captcha}>
              {busy ? <><LoaderCircle className="spin" size={18}/> Signing in and loading results…</> : <>Sign in and view results <span aria-hidden="true">→</span></>}
            </button>
            <p className="privacy-note"><ShieldCheck size={15}/> Credentials and tokens are kept in memory for this session only.</p>
          </form>
        </section>
      ) : (
        <section className="results-area">
          <div className="candidate-banner">
            <div className="avatar"><UserRound size={25}/></div>
            <div className="candidate-meta">
              <span className="muted-label">CANDIDATE</span>
              <h2>{safeText(firstValue(participant, "Name") !== "—" ? participant["Name"] : candidate.auth?.applicant_name)}</h2>
              <p>{safeText(firstValue(participant, "Participant ID", "Participant ID"))} <span className="dot-separator">·</span> {safeText(firstValue(participant, "Subject"))}</p>
            </div>
            <button className="secondary-button logout-button" onClick={logout}><LogOut size={16}/> Sign out</button>
          </div>

          {exams.length > 0 && (
            <div className="exam-picker">
              <label htmlFor="examSelect">Response sheet</label>
              <select id="examSelect" value={selectedExamId} onChange={(e) => { setDetails(null); setSelectedExamId(e.target.value); }} >
                {exams.map((exam) => <option key={exam.exam_id} value={exam.exam_id}>{safeText(exam.subject_name)} · {safeText(exam.exam_date)} · Shift {safeText(exam.shift)}</option>)}
              </select>
            </div>
          )}

          {loadingDetails ? (
            <div className="loading-panel"><LoaderCircle className="spin" size={28}/><strong>Loading official response sheet…</strong><span>This may take a few seconds.</span></div>
          ) : details ? (
            <>
              <div className="score-hero">
                <div className="score-main">
                  <span className="muted-label">OFFICIAL SCORE</span>
                  <div className="score-number">{safeText(firstValue(participant, "Score"))}<span> / {safeText(firstValue(participant, "Maximum Marks", "Total Questions"))}</span></div>
                  <div className="score-track"><div style={{ width: `${scorePercent}%` }}/></div>
                  <span className="score-caption">{scorePercent.toFixed(1)}% of maximum marks</span>
                </div>
                <div className="score-ring" style={{ "--progress": `${scorePercent}%` }}>
                  <div><strong>{scorePercent.toFixed(0)}%</strong><span>score rate</span></div>
                </div>
              </div>

              <div className="stat-grid">
                <div className="stat-card"><div className="stat-icon green"><CheckCircle2 size={19}/></div><span>Correct answers</span><strong>{safeText(firstValue(participant, "Total Correct"))}</strong></div>
                <div className="stat-card"><div className="stat-icon red"><XCircle size={19}/></div><span>Wrong answers</span><strong>{safeText(firstValue(participant, "Total Wrong"))}</strong></div>
                <div className="stat-card"><div className="stat-icon blue"><FileText size={19}/></div><span>Questions attempted</span><strong>{safeText(firstValue(participant, "Questions Attempted", "Total Attempted"))}</strong></div>
                <div className="stat-card"><div className="stat-icon purple"><BookOpen size={19}/></div><span>Exam date</span><strong className="date-value">{safeText(firstValue(exams.find((e) => e.exam_id === selectedExamId), "exam_date"))}</strong></div>
              </div>

              <div className="exam-info">
                <div><span>Subject</span><strong>{safeText(firstValue(participant, "Subject"))}</strong></div>
                <div><span>Test center</span><strong>{safeText(firstValue(participant, "Test Center Name"))}</strong></div>
                <div><span>Exam time</span><strong>{safeText(firstValue(exams.find((e) => e.exam_id === selectedExamId), "exam_time"))}</strong></div>
                <div><span>Language</span><strong>{safeText(firstValue(participant, "Default Language"))}</strong></div>
              </div>

              <section className="question-card">
                <div className="question-heading">
                  <div><h2>Question-wise analysis</h2><p>{questions.length} questions in the official response sheet</p></div>
                  <div className="question-actions">
                    <button type="button" className="secondary-button download-pdf-button" onClick={downloadResponseSheetPdf}><Download size={16}/> Download PDF</button>
                    <div className="table-tools">
                    <div className="search-box"><Search size={16}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search questions…" aria-label="Search questions"/></div>
                    <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter by result"><option>All</option><option>Correct</option><option>Wrong</option></select>
                    </div>
                  </div>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead><tr><th>Q. No.</th><th>Section</th><th>Your answer</th><th>Correct answer</th><th>Result</th><th>Marks</th></tr></thead>
                    <tbody>
                      {visibleQuestions.map((q, i) => {
                        const result = safeText(q["Result"]);
                        const isCorrect = result.toLowerCase() === "correct";
                        const isWrong = result.toLowerCase() === "wrong";
                        return <tr key={`${q["Question ID"] || "q"}-${q["Question Sr No"] || i}`} className="question-row" onClick={() => setSelectedQuestion(q)} tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedQuestion(q); } }} aria-label={`Open details for question ${safeText(q["Question Sr No"])}`}>
                          <td className="q-number"><button type="button" className="question-open-button" onClick={(event) => { event.stopPropagation(); setSelectedQuestion(q); }} aria-label={`View question ${safeText(q["Question Sr No"])}`}>{safeText(q["Question Sr No"])} <span>View</span></button></td>
                          <td>{safeText(q["Section Name"])}</td>
                          <td>{safeText(q["Selected Option Text"] ?? q["Selected Option Number"])}</td>
                          <td>{safeText(q["Correct Option Text"])}</td>
                          <td><span className={`result-pill ${isCorrect ? "is-correct" : isWrong ? "is-wrong" : ""}`}>{isCorrect ? <CheckCircle2 size={14}/> : isWrong ? <XCircle size={14}/> : null}{result}</span></td>
                          <td className="marks">{safeText(q["Score"])}</td>
                        </tr>;
                      })}
                      {!visibleQuestions.length && <tr><td colSpan="6" className="empty-state">No questions match your search or filter.</td></tr>}
                    </tbody>
                  </table>
                </div>
                <div className="table-footer">Showing {visibleQuestions.length} of {questions.length} questions</div>
              </section>
              <p className="disclaimer">Results are displayed from the official response-sheet API. Verify any consequential result with the AP DSC portal.</p>
            </>
          ) : (
            <div className="loading-panel"><FileText size={28}/><strong>Select a response sheet</strong><span>Choose an exam above to load its question-wise details.</span></div>
          )}
        </section>
      )}
      {selectedQuestion && (() => {
        const q = selectedQuestion;
        const questionIndex = questions.indexOf(q);
        const result = safeText(q["Result"]);
        const isCorrect = result.toLowerCase() === "correct";
        const isWrong = result.toLowerCase() === "wrong";
        const questionText = firstValue(q, "Question Text", "Question", "Question Description", "Question Content");
        return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedQuestion(null); }}>
          <section className="question-modal" role="dialog" aria-modal="true" aria-labelledby="question-modal-title">
            <header className="modal-header">
              <div><span className="modal-eyebrow">QUESTION DETAILS · {Math.max(0, questionIndex + 1)} OF {questions.length}</span><h2 id="question-modal-title">Question {safeText(firstValue(q, "Question Sr No"))}</h2><p>{safeText(firstValue(q, "Section Name"))}</p></div>
              <button type="button" className="modal-close" onClick={() => setSelectedQuestion(null)} aria-label="Close question details"><X size={20}/></button>
            </header>
            <div className="modal-content">
              <div className="modal-question-text"><span className="detail-label">QUESTION</span><QuestionContent value={questionText === "—" ? firstValue(q, "QUESTION", "Question") : questionText} cleanQuestionPath={q["clean question path"]} /></div>
              <div className="answer-summary">
                <div className="answer-summary-item"><span className="detail-label">YOUR ANSWER</span><strong>{safeText(firstValue(q, "Selected Option Text", "Selected Option Number", "Selected Option"))}</strong></div>
                <div className="answer-summary-item"><span className="detail-label">CORRECT ANSWER</span><strong>{safeText(firstValue(q, "Correct Option Text", "Correct Option Number", "Correct Option"))}</strong></div>
                <div className="answer-summary-item"><span className="detail-label">RESULT</span><strong><span className={`result-pill ${isCorrect ? "is-correct" : isWrong ? "is-wrong" : ""}`}>{isCorrect ? <CheckCircle2 size={14}/> : isWrong ? <XCircle size={14}/> : null}{result}</span></strong></div>
                <div className="answer-summary-item"><span className="detail-label">MARKS</span><strong>{safeText(firstValue(q, "Score", "Marks Awarded", "Marks"))}</strong></div>
              </div>
            </div>
            <div className="modal-footer modal-navigation">
              <button type="button" className="secondary-button modal-nav-button" disabled={questionIndex <= 0} onClick={() => setSelectedQuestion(questions[questionIndex - 1])}><ChevronLeft size={16}/> Previous</button>
              <span>{questionIndex + 1} / {questions.length} · Use ← → keys to navigate</span>
              {questionIndex < questions.length - 1
                ? <button type="button" className="primary-button modal-nav-button" onClick={() => setSelectedQuestion(questions[questionIndex + 1])}>Next <ChevronRight size={16}/></button>
                : <button type="button" className="primary-button modal-done" onClick={() => setSelectedQuestion(null)}>Close details</button>}
            </div>
          </section>
        </div>;
      })()}
      <footer>Response Sheet Viewer</footer>
    </main>
  );
}