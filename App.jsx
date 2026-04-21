import { useState, useEffect, useRef, useCallback } from "react";

// ─── SUPABASE CONFIG ──────────────────────────────────────────────────────────
const SB_URL = "https://qarcyngmnaookuullptu.supabase.co";
const SB_KEY = "sb_publishable_3wuq0kCHkvpvx0oJttEN2w_T4tJZKi3";
const H = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

const api = {
  async get(path) {
    const r = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: H });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async post(path, body) {
    const r = await fetch(`${SB_URL}/rest/v1/${path}`, { method: "POST", headers: H, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async patch(path, body) {
    const r = await fetch(`${SB_URL}/rest/v1/${path}`, { method: "PATCH", headers: H, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async del(path) {
    const r = await fetch(`${SB_URL}/rest/v1/${path}`, { method: "DELETE", headers: H });
    if (!r.ok) throw new Error(await r.text());
  },
};

// Resize foto voor opslag (max 900px breed, 70% kwaliteit)
const resizePhoto = (dataUrl) => new Promise((resolve) => {
  const img = new Image();
  img.onload = () => {
    const ratio = Math.min(1, 900 / img.width);
    const canvas = document.createElement("canvas");
    canvas.width = img.width * ratio;
    canvas.height = img.height * ratio;
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    resolve(canvas.toDataURL("image/jpeg", 0.7));
  };
  img.src = dataUrl;
});

// ─── STYLE TOKENS ─────────────────────────────────────────────────────────────
const C = {
  gold: "#C9A55A", goldLight: "#F5EDD8", goldBorder: "#E8D5A3",
  dark: "#1C1A17", mid: "#6B6560", light: "#F9F7F4",
  white: "#FFFFFF", border: "#EAE6E0",
  blue: "#3B82F6", green: "#16A34A", amber: "#D97706", red: "#DC2626",
};
const STATUS = {
  Open:  { dot: C.amber, bg: "#FFFBEB", text: "#92400E", border: "#FDE68A" },
  Loopt: { dot: C.blue,  bg: "#EFF6FF", text: "#1D4ED8", border: "#BFDBFE" },
  Klaar: { dot: C.green, bg: "#F0FDF4", text: "#15803D", border: "#86EFAC" },
};
const PSTATUS = {
  "Ontwerp":       { bg: "#F5F3FF", text: "#6D28D9", border: "#DDD6FE" },
  "In uitvoering": { bg: "#EFF6FF", text: "#1D4ED8", border: "#BFDBFE" },
  "Oplevering":    { bg: "#F0FDF4", text: "#15803D", border: "#86EFAC" },
  "On hold":       { bg: "#F9FAFB", text: "#6B7280", border: "#E5E7EB" },
};

const fmt = (d) => { if (!d) return "–"; const [y,m,day]=d.split("-"); return `${day}-${m}-${y}`; };
const overdue = (d, s) => s !== "Klaar" && d && new Date(d) < new Date();

// ─── KLEINE COMPONENTEN ───────────────────────────────────────────────────────
const Logo = ({ h=38 }) => (
  <img src="https://cortus.nl/wp-content/uploads/2024/04/logo_cortus.png"
    alt="Cortus Bouwregisseurs" style={{ height: h, objectFit: "contain", display: "block" }} />
);

const Badge = ({ label, bg, text, border }) => (
  <span style={{ fontSize:11, padding:"3px 9px", borderRadius:20, background:bg, color:text, border:`1px solid ${border}`, whiteSpace:"nowrap", fontWeight:600 }}>{label}</span>
);
const Pill = ({ s }) => { const sc = STATUS[s]||STATUS.Open; return <Badge label={s} {...sc} />; };
const ProjPill = ({ s }) => { const sc = PSTATUS[s]||PSTATUS["On hold"]; return <Badge label={s} {...sc} />; };

const Spinner = () => (
  <div style={{ display:"flex", alignItems:"center", justifyContent:"center", padding:60 }}>
    <div style={{ width:32, height:32, borderRadius:"50%", border:`3px solid ${C.goldBorder}`, borderTopColor:C.gold, animation:"spin 0.8s linear infinite" }} />
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
  </div>
);

const Field = ({ label, value, onChange, placeholder, type="text", rows }) => (
  <div style={{ marginBottom:14 }}>
    <label style={{ fontSize:11, fontWeight:700, color:C.mid, display:"block", marginBottom:5, letterSpacing:"0.08em", textTransform:"uppercase" }}>{label}</label>
    {rows
      ? <textarea value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} rows={rows}
          style={{ width:"100%", padding:"9px 12px", borderRadius:8, border:`1px solid ${C.border}`, fontSize:14, outline:"none", boxSizing:"border-box", color:C.dark, background:C.light, resize:"vertical", fontFamily:"inherit" }} />
      : <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
          style={{ width:"100%", padding:"9px 12px", borderRadius:8, border:`1px solid ${C.border}`, fontSize:14, outline:"none", boxSizing:"border-box", color:C.dark, background:C.light }} />
    }
  </div>
);

const Sel = ({ label, value, onChange, options }) => (
  <div style={{ marginBottom:14 }}>
    <label style={{ fontSize:11, fontWeight:700, color:C.mid, display:"block", marginBottom:5, letterSpacing:"0.08em", textTransform:"uppercase" }}>{label}</label>
    <select value={value} onChange={e=>onChange(e.target.value)}
      style={{ width:"100%", padding:"9px 12px", borderRadius:8, border:`1px solid ${C.border}`, fontSize:14, outline:"none", background:C.light, color:C.dark }}>
      {options.map(o=><option key={o} value={o}>{o}</option>)}
    </select>
  </div>
);

const PhotoUploader = ({ value, onChange }) => {
  const ref = useRef();
  const handle = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const resized = await resizePhoto(ev.target.result);
      onChange(resized);
    };
    reader.readAsDataURL(file);
  };
  return (
    <div style={{ marginBottom:14 }}>
      <label style={{ fontSize:11, fontWeight:700, color:C.mid, display:"block", marginBottom:5, letterSpacing:"0.08em", textTransform:"uppercase" }}>Foto koppelen</label>
      {value
        ? <div style={{ position:"relative", borderRadius:10, overflow:"hidden", border:`1px solid ${C.border}` }}>
            <img src={value} alt="bijlage" style={{ width:"100%", maxHeight:200, objectFit:"cover", display:"block" }} />
            <button onClick={()=>onChange("")} style={{ position:"absolute", top:8, right:8, background:"rgba(0,0,0,0.6)", color:"#fff", border:"none", borderRadius:"50%", width:28, height:28, cursor:"pointer", fontSize:14 }}>✕</button>
          </div>
        : <div onClick={()=>ref.current.click()}
            style={{ border:`2px dashed ${C.goldBorder}`, borderRadius:10, padding:"22px", textAlign:"center", cursor:"pointer", background:C.goldLight }}
            onMouseEnter={e=>e.currentTarget.style.background="#F0E6C8"}
            onMouseLeave={e=>e.currentTarget.style.background=C.goldLight}>
            <div style={{ fontSize:22, marginBottom:5 }}>📷</div>
            <div style={{ fontSize:13, color:C.mid }}>Klik om foto te uploaden</div>
            <div style={{ fontSize:11, color:"#bbb", marginTop:2 }}>Bouwfoto, schets, whiteboard</div>
            <input ref={ref} type="file" accept="image/*" onChange={handle} style={{ display:"none" }} />
          </div>
      }
    </div>
  );
};

const Modal = ({ title, onClose, onSave, saving, children }) => (
  <div style={{ position:"fixed", inset:0, background:"rgba(28,26,23,0.5)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:300, backdropFilter:"blur(4px)" }}>
    <div style={{ background:C.white, borderRadius:16, padding:28, width:480, maxWidth:"95vw", maxHeight:"90vh", overflowY:"auto", boxShadow:"0 24px 64px rgba(0,0,0,0.18)" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:22 }}>
        <h3 style={{ margin:0, fontSize:17, fontWeight:700, color:C.dark }}>{title}</h3>
        <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer", fontSize:20, color:"#ccc" }}>✕</button>
      </div>
      {children}
      <div style={{ display:"flex", gap:10, marginTop:24 }}>
        <button onClick={onClose} style={{ flex:1, padding:11, borderRadius:8, border:`1px solid ${C.border}`, background:C.white, cursor:"pointer", fontSize:14, color:C.mid }}>Annuleren</button>
        <button onClick={onSave} disabled={saving}
          style={{ flex:1, padding:11, borderRadius:8, border:"none", background:`linear-gradient(135deg, ${C.gold}, #B8922A)`, color:C.white, cursor:"pointer", fontSize:14, fontWeight:700, opacity:saving?0.7:1 }}>
          {saving ? "Opslaan..." : "Opslaan"}
        </button>
      </div>
    </div>
  </div>
);

// ─── HOOFDAPP ────────────────────────────────────────────────────────────────
export default function CortusApp() {
  const [projects, setProjects]         = useState([]);
  const [loading, setLoading]           = useState(true);
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState(null);
  const _upid = new URLSearchParams(window.location.search).get('pid');
  const [view, setView]                 = useState(_upid ? "project" : "dashboard");
  const [pid, setPid]                   = useState(_upid || null);
  const [tab, setTab]                   = useState("roadmap");
  const [modal, setModal]               = useState(null);
  const [form, setForm]                 = useState({});
  const [expandedAction, setExpanded]   = useState(null);
  const [clientView, setClientView]     = useState(!!_upid);

  const proj = projects.find(p => p.id === pid);
  const allOpen = projects.flatMap(p =>
    (p.actions||[]).filter(a => a.status !== "Klaar").map(a => ({ ...a, pname: p.name, pid: p.id }))
  );

  // ── DATA LADEN ──
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.get("rpc/get_projects_full");
      setProjects(data);
      setError(null);
    } catch(e) {
      setError("Kan data niet laden. Controleer je Supabase instellingen.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const closeModal = () => { setModal(null); setForm({}); };

  // ── OPSLAAN ──
  const saveModal = async () => {
    try {
      setSaving(true);
      if (modal === "project") {
        if (!form.name) return;
        await api.post("projects", { name:form.name, client:form.client||"", phase:form.phase||"", status:form.status||"Ontwerp", drive_link:form.drive_link||"", progress:0 });
      }
      if (modal === "action") {
        if (!form.action) return;
        await api.post("actions", { project_id:pid, action:form.action, owner:form.owner||"", status:form.status||"Open", deadline:form.deadline||"", note:form.note||"", photo:form.photo||"" });
      }
      if (modal === "editaction") {
        await api.patch(`actions?id=eq.${form.id}`, { action:form.action, owner:form.owner, status:form.status, deadline:form.deadline, note:form.note, photo:form.photo||"" });
      }
      if (modal === "decision") {
        if (!form.text) return;
        await api.post("decisions", { project_id:pid, text:form.text, date:form.date||"" });
      }
      if (modal === "agreement") {
        if (!form.text) return;
        await api.post("agreements", { project_id:pid, text:form.text, date:form.date||"" });
      }
      if (modal === "constatatie") {
        if (!form.text) return;
        await api.post("herstelpunten", { project_id:pid, text:form.text, date:form.date||"", categorie:form.categorie||"", document_url:form.document_url||"" });
      }
      if (modal === "editconstatatie") {
        await api.patch(`herstelpunten?id=eq.${form.id}`, { text:form.text, date:form.date||"" });
      }
      if (modal === "editdecision") {
        await api.patch(`decisions?id=eq.${form.id}`, { text:form.text, date:form.date||"" });
      }
      if (modal === "editagreement") {
        await api.patch(`agreements?id=eq.${form.id}`, { text:form.text, date:form.date||"" });
      }
      if (modal === "editproject") {
        if (!form.name) return;
        await api.patch(`projects?id=eq.${form.id}`, { name:form.name, client:form.client||"", phase:form.phase||"", status:form.status||"Ontwerp", drive_link:form.drive_link||"", progress:parseInt(form.progress)||0 });
      }
      if (modal === "bouwfoto") { if (!form.photo) return; await api.post("bouwfotos", { project_id:pid, caption:form.caption||"", date:form.date||"", photo:form.photo||"" }); }
      await loadData();
      closeModal();
    } catch(e) {
      alert("Opslaan mislukt: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  // ── STATUS WISSELEN ──
  const cycleStatus = async (actionId, current) => {
    const cycle = { Open:"Loopt", Loopt:"Klaar", Klaar:"Open" };
    const next = cycle[current];
    // Optimistisch updaten
    setProjects(ps => ps.map(p => ({ ...p, actions: (p.actions||[]).map(a => a.id !== actionId ? a : { ...a, status: next }) })));
    try {
      await api.patch(`actions?id=eq.${actionId}`, { status: next });
    } catch(e) {
      await loadData(); // herstel bij fout
    }
  };

  // -- CONSTATATIE VERWIJDEREN --
  const deleteConstatatie = async (id) => {
    setProjects(ps => ps.map(p => ({ ...p, herstelpunten: (p.herstelpunten||[]).filter(c => c.id !== id) })));
    try {
      await api.del(`constataties?id=eq.${id}`);
    } catch(e) {
      await loadData();
    }
  };

  // -- BESLUIT VERWIJDEREN --
  const deleteDecision = async (id) => {
    setProjects(ps => ps.map(p => ({ ...p, decisions: (p.decisions||[]).filter(d => d.id !== id) })));
    try {
      await api.del(`decisions?id=eq.${id}`);
    } catch(e) {
      await loadData();
    }
  };

  // -- AFSPRAAK VERWIJDEREN --
  const deleteAgreement = async (id) => {
    setProjects(ps => ps.map(p => ({ ...p, agreements: (p.agreements||[]).filter(ag => ag.id !== id) })));
    try {
      await api.del(`agreements?id=eq.${id}`);
    } catch(e) {
      await loadData();
    }
  };

  // ── ACTIE VERWIJDEREN ──
  const deleteAction = async (actionId) => {
    setProjects(ps => ps.map(p => ({ ...p, actions: (p.actions||[]).filter(a => a.id !== actionId) })));
    try {
      await api.del(`actions?id=eq.${actionId}`);
    } catch(e) {
      await loadData();
    }
  };

  // ── PROJECT VERWIJDEREN ──
  const deleteProject = async (projId, projName) => {
    if (!window.confirm(`Project "${projName}" definitief verwijderen?\n\nAlle acties, besluiten, afspraken en constateringen worden ook verwijderd.`)) return;
    setProjects(ps => ps.filter(p => p.id !== projId));
    if (pid === projId) { setPid(null); setView("dashboard"); }
    try {
      await api.del(`actions?project_id=eq.${projId}`);
      await api.del(`decisions?project_id=eq.${projId}`);
      await api.del(`agreements?project_id=eq.${projId}`);
      await api.del(`constataties?project_id=eq.${projId}`);
      await api.del(`projects?id=eq.${projId}`);
    } catch(e) {
      await loadData();
    }
  }

  // ── CLIENT VIEW ──
if (clientView) {
  if (!proj) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh"}}><Spinner /></div>;
  const pct = proj.progress || 0;
  const openA = (proj.actions||[]).filter(a => a.status !== "Klaar");
  const doneA = (proj.actions||[]).filter(a => a.status === "Klaar");
  return (
    <div style={{ minHeight:"100vh", background:"#F4F2EE", fontFamily:"'Inter', system-ui, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');`}</style>
      {/* Header: donker grijs blok met logo in wit kaartje */}
      <div style={{ background:"#56626e", padding:"16px 32px", display:"flex", alignItems:"center", borderBottom:"1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ background:"#fff", borderRadius:10, padding:"10px 18px", boxShadow:"0 2px 10px rgba(0,0,0,0.25)", display:"inline-flex", alignItems:"center" }}>
          <Logo h={52} />
        </div>
      </div>
      {/* Project band */}
      <div style={{ background:"#56626e", borderBottom:"1px solid rgba(255,255,255,0.08)", paddingBottom:24 }}>
        <div style={{ maxWidth:820, margin:"0 auto", padding:"20px 32px 0" }}>
          <div style={{ fontSize:11, letterSpacing:"0.1em", textTransform:"uppercase", color:"rgba(255,255,255,0.45)", fontWeight:500, marginBottom:6 }}>Uw projectdossier</div>
          <h1 style={{ margin:"0 0 4px", fontSize:26, fontWeight:700, color:"#ffffff", letterSpacing:"-0.02em", fontFamily:"'Inter',sans-serif" }}>{proj.name}</h1>
          <div style={{ fontSize:14, color:"rgba(255,255,255,0.65)", marginBottom:18, fontWeight:500 }}>{proj.client}{proj.phase ? ` · ${proj.phase}` : ""}</div>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ flex:1, height:5, background:"rgba(255,255,255,0.15)", borderRadius:99, overflow:"hidden" }}>
              <div style={{ width:`${pct}%`, height:"100%", background:"#ffffff", borderRadius:99, transition:"width 0.6s" }} />
            </div>
            <span style={{ fontSize:13, fontWeight:600, color:"rgba(255,255,255,0.85)", minWidth:34 }}>{pct}%</span>
          </div>
        </div>
      </div>
      {/* Content */}
      <div style={{ maxWidth:820, margin:"0 auto", padding:"28px 32px 60px" }}>
        {/* Welkom */}
        <div style={{ background:"#56626e", borderRadius:10, padding:"22px 24px", marginBottom:20, boxShadow:"0 2px 8px rgba(0,0,0,0.12)", borderLeft:"4px solid #56626e" }}>
          <p style={{ margin:"0 0 8px", fontSize:16, color:"#ffffff", lineHeight:1.5, fontWeight:700, fontFamily:"'Inter',sans-serif" }}>Welkom op het projectportaal.</p>
          <p style={{ margin:0, fontSize:15, color:"rgba(255,255,255,0.72)", lineHeight:1.75, fontWeight:400, fontFamily:"'Inter',sans-serif" }}>Hier volgt u eenvoudig de voortgang van uw project. U vindt hier alle actuele informatie, documenten en updates overzichtelijk op één plek.</p>
        </div>
        {proj.drive_link && (
          <a href={proj.drive_link} target="_blank" rel="noopener noreferrer" style={{ display:"inline-flex", alignItems:"center", gap:8, background:"#fff", border:"1px solid #D8D5CE", borderRadius:8, padding:"10px 16px", marginBottom:24, fontSize:14, color:"#56626e", fontWeight:500, textDecoration:"none", boxShadow:"0 1px 3px rgba(0,0,0,0.05)", fontFamily:"'Inter',sans-serif" }}>📁 Projectdossier openen in Google Drive →</a>
        )}
        <div style={{ display:"flex", borderBottom:"2px solid #E8E5DF", marginBottom:24 }}>
          {[["roadmap","Roadmap tot start"],["acties","Actiepunten"],["besluiten","Besluiten"],["bouwfotos","Voortgang"],["planning","Afbouwplanning"]].map(([tv,lv]) => (
            <button key={tv} onClick={()=>setTab(tv)} style={{ background:"none", border:"none", padding:"10px 16px", cursor:"pointer", fontSize:14, fontWeight:tab===tv?600:400, color:tab===tv?"#56626e":"#8A8278", borderBottom:tab===tv?"3px solid #56626e":"3px solid transparent", marginBottom:"-2px", transition:"all 0.15s", fontFamily:"'Inter',sans-serif" }}>{lv}</button>
          ))}
        </div>

          {tab==="acties" && (
          <div>
            {/* Acties tabel header */}
            <div style={{ display:"grid", gridTemplateColumns:"36px 1fr 90px 110px 96px", gap:0, background:"#f0ede8", borderRadius:"8px 8px 0 0", padding:"8px 12px", marginBottom:0, borderBottom:"1px solid #E0DDD7" }}>
              <div style={{ fontSize:11, fontWeight:600, color:"#8A8278", textTransform:"uppercase", letterSpacing:"0.06em" }}>#</div>
              <div style={{ fontSize:11, fontWeight:600, color:"#8A8278", textTransform:"uppercase", letterSpacing:"0.06em" }}>Actie</div>
              <div style={{ fontSize:11, fontWeight:600, color:"#8A8278", textTransform:"uppercase", letterSpacing:"0.06em" }}>Toegewezen</div>
              <div style={{ fontSize:11, fontWeight:600, color:"#8A8278", textTransform:"uppercase", letterSpacing:"0.06em" }}>Status</div>
              <div style={{ fontSize:11, fontWeight:600, color:"#8A8278", textTransform:"uppercase", letterSpacing:"0.06em" }}>Deadline</div>
            </div>
            {(proj.actions||[]).filter(a=>a.status!=="Klaar").map((a,i) => {
              const sc = a.status==="Klaar"?"#4caf50":a.status==="Loopt"?"#2196f3":a.status==="Wacht op OG"?"#ff9800":"#56626e";
              const dl = a.deadline ? new Date(a.deadline) : null;
              const isLate = dl && dl < new Date() && a.status!=="Klaar";
              return (
                <div key={a.id} style={{ display:"grid", gridTemplateColumns:"36px 1fr 90px 110px 96px", gap:0, padding:"10px 12px", borderBottom:"1px solid #EAE7E2", background:i%2===0?"#fff":"#fafaf8", alignItems:"start" }}>
                  <div style={{ fontSize:12, fontWeight:600, color:"#8A8278", paddingTop:2 }}>{i+1}</div>
                  <div>
                    <div style={{ fontSize:13, fontWeight:500, color:"#1C1A17", lineHeight:1.4 }}>{a.action}</div>
                    {a.note && <div style={{ fontSize:11, color:"#9a9590", marginTop:3, lineHeight:1.3 }}>{a.note}</div>}
                  </div>
                  <div style={{ fontSize:12, color:"#56626e", fontWeight:500, paddingTop:2 }}>{a.owner||"—"}</div>
                  <div style={{ paddingTop:1 }}>
                    <span style={{ fontSize:11, fontWeight:600, color:"#fff", background:sc, borderRadius:4, padding:"2px 7px", whiteSpace:"nowrap" }}>{a.status}</span>
                    {a.status !== "Klaar" && (
                      <button onClick={async () => {
                        try {
                          await api.patch(`actions?id=eq.${a.id}`, { status: "Klaar" });
                          setProjects(ps => ps.map(p => ({...p, actions:(p.actions||[]).map(x => x.id===a.id ? {...x, status:"Klaar"} : x)})));
                        } catch(err) { alert("Fout: " + err.message); }
                      }} style={{ marginTop:5, fontSize:10, fontWeight:600, padding:"2px 7px", borderRadius:4, border:"none", cursor:"pointer", background:"#4caf50", color:"#fff" }}>
                        ✓ Gereed
                      </button>
                    )}
                  </div>
                  <div style={{ fontSize:12, color:isLate?"#e53935":"#56626e", fontWeight:isLate?600:400, paddingTop:2 }}>{a.deadline||"—"}</div>
                </div>
              );
            })}
            {(proj.actions||[]).filter(a=>a.status==="Klaar").length > 0 && (
              <div style={{ marginTop:16 }}>
                <div style={{ fontSize:11, fontWeight:600, color:"#8A8278", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:8, paddingLeft:12 }}>✓ Afgerond ({(proj.actions||[]).filter(a=>a.status==="Klaar").length})</div>
                {(proj.actions||[]).filter(a=>a.status==="Klaar").map((a,i,arr) => {
                  const startIdx = (proj.actions||[]).filter(a=>a.status!=="Klaar").length;
                  const globalIdx = (proj.actions||[]).findIndex(x=>x.id===a.id);
                  return (
                    <div key={a.id} style={{ display:"grid", gridTemplateColumns:"36px 1fr 90px 110px 96px", gap:0, padding:"8px 12px", borderBottom:"1px solid #EAE7E2", background:"#f8f8f6", alignItems:"start", opacity:0.7 }}>
                      <div style={{ fontSize:12, fontWeight:600, color:"#bbb", paddingTop:2 }}>{globalIdx+1}</div>
                      <div style={{ fontSize:13, fontWeight:400, color:"#888", textDecoration:"line-through", lineHeight:1.4 }}>{a.action}</div>
                      <div style={{ fontSize:12, color:"#aaa" }}>{a.owner||"—"}</div>
                      <div><span style={{ fontSize:11, fontWeight:600, color:"#fff", background:"#4caf50", borderRadius:4, padding:"2px 7px" }}>Klaar</span></div>
                      <div style={{ fontSize:12, color:"#aaa" }}>{a.deadline||"—"}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {tab==="besluiten" && (
            <div>
              {(proj.decisions||[]).length===0 && <div style={{ color:"#bbb", textAlign:"center", padding:40, fontSize:14 }}>Nog geen besluiten vastgelegd</div>}
              {(proj.decisions||[]).map(d => (
                <div key={d.id} style={{ background:C.white, borderRadius:12, border:`1px solid ${C.border}`, padding:"14px 20px", marginBottom:8, display:"flex", gap:14, alignItems:"flex-start" }}>
                  <div style={{ width:6, height:6, borderRadius:"50%", background:"#56626e", marginTop:7, flexShrink:0 }}></div>
                  <div style={{ flex:1, fontSize:14, color:C.dark }}>{d.text}</div>
                  <div style={{ fontSize:12, color:"#bbb", whiteSpace:"nowrap" }}>{fmt(d.date)}</div>
                </div>
              ))}
            </div>
          )}
          {tab==="roadmap" && (
            <div>
              {proj.roadmap_url ? (
                <iframe src={proj.roadmap_url} style={{ width:"100%", height:"80vh", border:"none", borderRadius:12 }} title="Planning" />
              ) : (
                <div style={{ color:C.mid, textAlign:"center", padding:40 }}>Er is nog geen planning beschikbaar voor dit project.</div>
              )}
            </div>
          )}
          {tab==="bouwfotos" && (
            <div>
              {(proj.bouwfotos||[]).length===0 && <div style={{ color:"#bbb", textAlign:"center", padding:40, fontSize:14 }}>Nog geen bouwfoto’s beschikbaar</div>}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(200px, 1fr))", gap:12 }}>
                {(proj.bouwfotos||[]).map(f => (
                  <div key={f.id} style={{ background:C.white, borderRadius:10, border:`1px solid ${C.border}`, overflow:"hidden", boxShadow:"0 1px 4px rgba(0,0,0,0.04)" }}>
                    <img src={f.photo} alt={f.caption||""} style={{ width:"100%", height:160, objectFit:"cover", display:"block" }} />
                    <div style={{ padding:"10px 12px" }}>
                      <div style={{ fontSize:13, color:C.dark, fontWeight:600 }}>{f.caption||"Bouwfoto"}</div>
                      <div style={{ fontSize:11, color:"#bbb", marginTop:3 }}>{fmt(f.date)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {tab==="planning" && (
            <div>
              {proj.planning_url ? (
                <iframe src={proj.planning_url} style={{ width:"100%", height:"80vh", border:"none", borderRadius:12 }} title="Planning" />
              ) : (
                <div style={{ color:C.mid, textAlign:"center", padding:40 }}>Er is nog geen planning beschikbaar voor dit project.</div>
              )}
            </div>
          )}
          <div style={{ marginTop:40, paddingTop:24, borderTop:`1px solid ${C.border}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <Logo h={28} />
            <div style={{ fontSize:12, color:"#bbb" }}>074 – 750 8801 · cortus.nl</div>
          </div>
        </div>
      </div>
    );
  }
    // ── ADMIN VIEW ──
  return (
    <div style={{ minHeight:"100vh", background:C.light, fontFamily:"'Georgia', serif" }}>

      {/* NAV */}
      <nav style={{ background:C.white, borderBottom:`1px solid ${C.border}`, padding:"0 28px", height:66, display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:100, boxShadow:"0 1px 12px rgba(0,0,0,0.04)" }}>
        <Logo h={40} />
        <div style={{ display:"flex", gap:6, alignItems:"center" }}>
          {[["dashboard","Overzicht"],["weekly","Weekoverzicht"]].map(([v,l]) => (
            <button key={v} onClick={()=>{ setView(v); setPid(null); }}
              style={{ padding:"8px 16px", borderRadius:7, border:"none", cursor:"pointer", fontSize:13, fontWeight:view===v?700:400, background:view===v?C.dark:"transparent", color:view===v?C.white:C.mid }}>
              {l}
            </button>
          ))}
          <div style={{ width:1, height:20, background:C.border, margin:"0 4px" }} />
          <button onClick={()=>{ setModal("project"); setForm({ status:"Ontwerp", name:"", client:"", phase:"", drive_link:"" }); }}
            style={{ padding:"8px 16px", borderRadius:7, border:`1.5px solid ${C.gold}`, background:"transparent", cursor:"pointer", fontSize:13, fontWeight:700, color:C.gold }}>
            + Nieuw project
          </button>
        </div>
      </nav>

      <div style={{ display:"flex", minHeight:"calc(100vh - 66px)" }}>

        {/* SIDEBAR */}
        <aside style={{ width:256, background:C.white, borderRight:`1px solid ${C.border}`, padding:"20px 14px", flexShrink:0 }}>
          <div style={{ fontSize:10, fontWeight:800, color:"#bbb", letterSpacing:"0.15em", textTransform:"uppercase", marginBottom:12, paddingLeft:8 }}>Projecten</div>
          {loading && <Spinner />}
          {!loading && projects.map(p => {
            const open = (p.actions||[]).filter(a=>a.status!=="Klaar").length;
            const sc = PSTATUS[p.status]||PSTATUS["On hold"];
            const active = pid===p.id && view==="project";
            return (
              <div key={p.id} style={{ position:"relative", marginBottom:3 }}
                onMouseEnter={e=>{ const btn=e.currentTarget.querySelector('.proj-actions'); if(btn) btn.style.opacity="1"; }}
                onMouseLeave={e=>{ const btn=e.currentTarget.querySelector('.proj-actions'); if(btn) btn.style.opacity="0"; }}>
                <button onClick={()=>{ setPid(p.id); setView("project"); setTab("acties"); }}
                  style={{ width:"100%", textAlign:"left", padding:"11px 12px", borderRadius:9, border:active?`1.5px solid ${C.gold}`:"1.5px solid transparent", background:active?C.goldLight:"transparent", cursor:"pointer" }}
                  onMouseEnter={e=>{ if(!active) e.currentTarget.style.background=C.light; }}
                  onMouseLeave={e=>{ if(!active) e.currentTarget.style.background="transparent"; }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:700, color:C.dark, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{p.name}</div>
                      <div style={{ fontSize:11, color:C.mid, marginTop:2, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{p.client}</div>
                    </div>
                    {open>0 && <span style={{ fontSize:10, background:C.goldLight, color:"#92400E", border:`1px solid ${C.goldBorder}`, borderRadius:10, padding:"1px 7px", marginLeft:8, flexShrink:0, fontWeight:700 }}>{open}</span>}
                  </div>
                  <div style={{ marginTop:7 }}>
                    <span style={{ fontSize:11, padding:"2px 8px", borderRadius:10, background:sc.bg, color:sc.omschrijving, border:`1px solid ${sc.border}`, fontWeight:600 }}>{p.status}</span>
                  </div>
                </button>
                <div className="proj-actions" style={{ position:"absolute", top:6, right:6, display:"flex", gap:3, opacity:0, transition:"opacity 0.15s" }}>
                  <button onClick={e=>{ e.stopPropagation(); setModal("editproject"); setForm({ id:p.id, name:p.name, client:p.client||"", phase:p.phase||"", status:p.status||"Ontwerp", drive_link:p.drive_link||"", progress:p.progress||0 }); }}
                    title="Bewerken"
                    style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:5, width:22, height:22, cursor:"pointer", fontSize:11, display:"flex", alignItems:"center", justifyContent:"center", color:C.mid }}>✏️</button>
                  <button onClick={e=>{ e.stopPropagation(); deleteProject(p.id, p.name); }}
                    title="Verwijderen"
                    style={{ background:"#fff", border:`1px solid #FECACA`, borderRadius:5, width:22, height:22, cursor:"pointer", fontSize:11, display:"flex", alignItems:"center", justifyContent:"center", color:"#EF4444" }}>✕</button>
                </div>
              </div>
            );
          })}
        </aside>

        {/* MAIN */}
        <main style={{ flex:1, padding:"32px 36px", overflowY:"auto" }}>
          {error && <div style={{ background:"#FEF2F2", border:`1px solid #FECACA`, borderRadius:10, padding:"14px 18px", marginBottom:20, color:C.red, fontSize:14 }}>⚠️ {error}</div>}

          {/* DASHBOARD */}
          {view==="dashboard" && (
            <div>
              <div style={{ marginBottom:28 }}>
                <h1 style={{ fontSize:26, fontWeight:700, color:C.dark, margin:"0 0 6px" }}>Goedemorgen, Mark</h1>
                <p style={{ color:C.mid, fontSize:14, margin:0 }}>{projects.length} projecten · {allOpen.length} openstaande acties</p>
              </div>
              {loading ? <Spinner /> : (
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(260px, 1fr))", gap:16 }}>
                  {projects.map(p => {
                    const open = (p.actions||[]).filter(a=>a.status!=="Klaar").length;
                    const sc = PSTATUS[p.status]||PSTATUS["On hold"];
                    return (
                      <div key={p.id} onClick={()=>{ setPid(p.id); setView("project"); setTab("acties"); }}
                        style={{ background:C.white, borderRadius:14, border:`1px solid ${C.border}`, padding:20, cursor:"pointer", boxShadow:"0 1px 4px rgba(0,0,0,0.04)", transition:"all 0.2s" }}
                        onMouseEnter={e=>{ e.currentTarget.style.borderColor=C.gold; e.currentTarget.style.boxShadow=`0 4px 20px rgba(201,165,90,0.12)`; }}
                        onMouseLeave={e=>{ e.currentTarget.style.borderColor=C.border; e.currentTarget.style.boxShadow="0 1px 4px rgba(0,0,0,0.04)"; }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:14 }}>
                          <div>
                            <div style={{ fontSize:15, fontWeight:700, color:C.dark }}>{p.name}</div>
                            <div style={{ fontSize:12, color:C.mid, marginTop:3 }}>{p.client}</div>
                          </div>
                          <span style={{ fontSize:11, padding:"3px 9px", borderRadius:20, background:sc.bg, color:sc.omschrijving, border:`1px solid ${sc.border}`, fontWeight:600 }}>{p.status}</span>
                        </div>
                        <div style={{ background:C.light, borderRadius:4, height:4, marginBottom:14 }}>
                          <div style={{ background:`linear-gradient(90deg, ${C.gold}, #B8922A)`, borderRadius:4, height:4, width:`${p.progress}%` }}></div>
                        </div>
                        <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:C.mid }}>
                          <span>{p.phase||"–"}</span>
                          {open>0 ? <span style={{ color:"#92400E", fontWeight:700 }}>{open} open</span> : <span style={{ color:C.green, fontWeight:700 }}>✓ Alles klaar</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* WEEKLY */}
          {view==="weekly" && (
            <div>
              <h1 style={{ fontSize:26, fontWeight:700, color:C.dark, margin:"0 0 6px" }}>Weekoverzicht</h1>
              <p style={{ color:C.mid, fontSize:14, margin:"0 0 24px" }}>Alle openstaande acties — {allOpen.length} totaal</p>
              {loading ? <Spinner /> : allOpen.length===0
                ? <div style={{ textAlign:"center", padding:60, color:"#bbb", fontSize:16 }}>Alles staat op groen ✓</div>
                : allOpen.map(a => {
                    const sc = STATUS[a.status]||STATUS.Open;
                    const od = overdue(a.deadline, a.status);
                    return (
                      <div key={`${a.pid}-${a.id}`} style={{ background:C.white, borderRadius:12, border:`1px solid ${C.border}`, padding:"14px 20px", marginBottom:8, display:"flex", alignItems:"center", gap:14 }}>
                        <div style={{ width:8, height:8, borderRadius:"50%", background:sc.dot, flexShrink:0 }}></div>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:14, fontWeight:600, color:C.dark }}>{a.action}</div>
                          <div style={{ fontSize:12, color:C.mid, marginTop:2 }}>{a.pname}</div>
                        </div>
                        {a.photo && <div style={{ width:36, height:36, borderRadius:6, overflow:"hidden", flexShrink:0 }}><img src={a.photo} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} /></div>}
                        <div style={{ fontSize:12, color:C.mid, background:C.light, padding:"3px 10px", borderRadius:6 }}>{a.owner||"–"}</div>
                        <Pill s={a.status} />
                        <div style={{ fontSize:12, minWidth:72, textAlign:"right", color:od?C.red:"#bbb", fontWeight:od?700:400 }}>{fmt(a.deadline)}</div>
                      </div>
                    );
                  })
              }
            </div>
          )}

          {/* PROJECT DETAIL */}
          {view==="project" && proj && (
            <div>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:24 }}>
                <div>
                  <h1 style={{ fontSize:26, fontWeight:700, color:C.dark, margin:"0 0 8px" }}>{proj.name}</h1>
                  <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
                    <span style={{ fontSize:14, color:C.mid }}>{proj.client}</span>
                    <ProjPill s={proj.status} />
                    {proj.phase && <span style={{ fontSize:12, padding:"3px 9px", borderRadius:20, background:C.light, color:C.mid, border:`1px solid ${C.border}` }}>{proj.phase}</span>}
                  </div>
                </div>
                <div style={{ display:"flex", gap:8 }}>
                  {proj.drive_link && (
                    <a href={proj.drive_link} target="_blank" rel="noopener noreferrer"
                      style={{ display:"flex", alignItems:"center", gap:6, padding:"9px 16px", borderRadius:8, background:C.white, border:`1px solid ${C.border}`, color:C.dark, textDecoration:"none", fontSize:13, fontWeight:600 }}>
                      📁 Drive
                    </a>
                  )}
                  <button onClick={()=>setClientView(true)}
                    style={{ padding:"9px 16px", borderRadius:8, background:C.dark, color:C.white, border:"none", cursor:"pointer", fontSize:13, fontWeight:700 }}>
                    Klantweergave →
                  </button>
                  <button onClick={(e)=>{ const u=window.location.origin+'/?pid='+pid; navigator.clipboard.writeText(u).then(()=>{ e.target.textContent='\u2714 Gekopieerd!'; setTimeout(()=>{ e.target.textContent='\uD83D\uDD17 Kopieer deellink'; },2000); }).catch(()=>prompt('Kopieer deze link:',u)); }}
                    style={{ padding:"9px 16px", borderRadius:8, background:C.gold, color:C.white, border:"none", cursor:"pointer", fontSize:13, fontWeight:700 }}>
                    🔗 Kopieer deellink
                  </button>
                </div>
              </div>

              {/* Progress */}
              <div style={{ background:C.white, borderRadius:12, border:`1px solid ${C.border}`, padding:"16px 20px", marginBottom
:20 }}>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, color:C.mid, marginBottom:8 }}>
                  <span>Voortgang</span><span style={{ fontWeight:700, color:C.gold }}>{proj.progress}%</span>
                </div>
                <div style={{ background:C.light, borderRadius:6, height:6 }}>
                  <div style={{ background:`linear-gradient(90deg, ${C.gold}, #B8922A)`, borderRadius:6, height:6, width:`${proj.progress}%` }}></div>
                </div>
              </div>

              {/* Tabs */}
              <div style={{ display:"flex", borderBottom:`1px solid ${C.border}`, marginBottom:20 }}>
                {[["roadmap","Roadmap tot start"],["acties","Actiepunten"],["besluiten","Besluiten"],["bouwfotos","Voortgang"],["planning","Afbouwplanning"]].map(([t,l]) => {
                  const cnt = t==="acties" ? (proj.actions||[]).filter(a=>a.status!=="Klaar").length : 0;
                  return (
                    <button key={t} onClick={()=>setTab(t)}
                      style={{ padding:"10px 22px", border:"none", background:"transparent", cursor:"pointer", fontSize:14, fontWeight:tab===t?700:400, color:tab===t?C.dark:C.mid, borderBottom:tab===t?`2.5px solid ${C.gold}`:"2.5px solid transparent", marginBottom:-1 }}>
                      {l}{cnt>0 && <span style={{ marginLeft:6, fontSize:11, background:C.goldLight, color:"#92400E", border:`1px solid ${C.goldBorder}`, borderRadius:10, padding:"1px 7px", fontWeight:700 }}>{cnt}</span>}
                    </button>
                  );
                })}
              </div>

              {/* ACTIES */}
              {tab==="acties" && (
                <div>
                  {(proj.actions||[]).length===0 && <div style={{ color:"#ccc", textAlign:"center", padding:40, fontSize:14 }}>Nog geen acties — voeg er een toe</div>}
                  {(proj.actions||[]).map((a, idx) => {
                    const sc = STATUS[a.status]||STATUS.Open;
                    const od = overdue(a.deadline, a.status);
                    const expanded = expandedAction===a.id;
                    return (
                      <div key={a.id} style={{ background:C.white, borderRadius:12, border:`1px solid ${C.border}`, marginBottom:8, overflow:"hidden" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:14, padding:"14px 18px" }}>
                          <span style={{ fontSize:11, fontWeight:700, color:"#9a9590", minWidth:22, textAlign:"right", flexShrink:0 }}>{idx+1}</span>
                          <button onClick={()=>cycleStatus(a.id, a.status)}
                            style={{ width:24, height:24, borderRadius:"50%", border:`2px solid ${a.status==="Klaar"?C.green:a.status==="Loopt"?C.blue:C.gold}`, background:a.status==="Klaar"?C.green:"transparent", cursor:"pointer", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, color:C.white }}>
                            {a.status==="Klaar"?"✓":a.status==="Loopt"?<div style={{ width:8, height:8, borderRadius:"50%", background:C.blue }}></div>:""}
                          </button>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:14, fontWeight:600, color:a.status==="Klaar"?"#bbb":C.dark, textDecoration:a.status==="Klaar"?"line-through":"none" }}>{a.action}</div>
                            {a.note && <div style={{ fontSize:12, color:C.mid, marginTop:2, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{a.note}</div>}
                          </div>
                          {a.photo && (
                            <div style={{ width:36, height:36, borderRadius:6, overflow:"hidden", flexShrink:0, cursor:"pointer" }} onClick={()=>setExpanded(expanded?null:a.id)}>
                              <img src={a.photo} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                            </div>
                          )}
                          <div style={{ fontSize:12, color:C.mid, background:C.light, padding:"3px 10px", borderRadius:6, whiteSpace:"nowrap" }}>{a.owner||"–"}</div>
                          <Pill s={a.status} />
                          <div style={{ fontSize:12, minWidth:72, textAlign:"right", color:od?C.red:"#bbb", fontWeight:od?700:400 }}>{fmt(a.deadline)}</div>
                          <div style={{ display:"flex", gap:4 }}>
                            <button onClick={()=>{ setModal("editaction"); setForm({...a}); }}
                              style={{ background:"none", border:"none", cursor:"pointer", fontSize:13, color:"#ccc", padding:"2px 4px" }}
                              onMouseEnter={e=>e.target.style.color=C.gold}
                              onMouseLeave={e=>e.target.style.color="#ccc"}>✏️</button>
                            <button onClick={()=>deleteAction(a.id)}
                              style={{ background:"none", border:"none", cursor:"pointer", fontSize:13, color:"#ccc", padding:"2px 4px" }}
                              onMouseEnter={e=>e.target.style.color=C.red}
                              onMouseLeave={e=>e.target.style.color="#ccc"}>✕</button>
                          </div>
                        </div>
                        {expanded && a.photo && (
                          <div style={{ borderTop:`1px solid ${C.border}` }}>
                            <img src={a.photo} alt="" style={{ width:"100%", maxHeight:300, objectFit:"cover", display:"block" }} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <button onClick={()=>{ setModal("action"); setForm({ status:"Open", deadline:"", owner:"", action:"", note:"", photo:"" }); }}
                    style={{ marginTop:8, color:C.gold, background:"none", border:"none", cursor:"pointer", fontSize:14, fontWeight:700, display:"flex", alignItems:"center", gap:6 }}>
                    + Actie toevoegen
                  </button>
                </div>
              )}

              {/* BESLUITEN */}
              {tab==="besluiten" && (
                <div>
                  {(proj.decisions||[]).length===0 && <div style={{ color:"#ccc", textAlign:"center", padding:40, fontSize:14 }}>Nog geen besluiten vastgelegd</div>}
                  {(proj.decisions||[]).map(d => (
                    <div key={d.id} style={{ background:C.white, borderRadius:12, border:`1px solid ${C.border}`, padding:"14px 20px", marginBottom:8, display:"flex", gap:14, alignItems:"flex-start" }}>
                      <div style={{ width:6, height:6, borderRadius:"50%", background:C.gold, marginTop:7, flexShrink:0 }}></div>
                      <div style={{ flex:1, fontSize:14, color:C.dark }}>{d.text}</div>
                      <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                        <div style={{ fontSize:12, color:"#bbb", whiteSpace:"nowrap" }}>{fmt(d.date)}</div>
                        <button onClick={()=>{ setModal("editdecision"); setForm({...d}); }}
                          style={{ background:"none", border:"none", cursor:"pointer", fontSize:12, color:"#bbb", padding:"2px 4px" }}
                          onMouseEnter={e=>e.target.style.color=C.gold}
                          onMouseLeave={e=>e.target.style.color="#bbb"}>✏</button>
                        <button onClick={()=>deleteDecision(d.id)}
                          style={{ background:"none", border:"none", cursor:"pointer", fontSize:13, color:"#ccc", padding:"2px 4px" }}
                          onMouseEnter={e=>e.target.style.color=C.red}
                          onMouseLeave={e=>e.target.style.color="#ccc"}>×</button>
                      </div>
                    </div>
                  ))}
                  <button onClick={()=>{ setModal("decision"); setForm({ date:new Date().toISOString().split("T")[0], text:"" }); }}
                    style={{ marginTop:8, color:C.gold, background:"none", border:"none", cursor:"pointer", fontSize:14, fontWeight:700 }}>
                    + Besluit vastleggen
                  </button>
                </div>
              )}

              {/* AFSPRAKEN */}
              {tab==="afspraken" && (
                <div>
                  {(proj.agreements||[]).length===0 && <div style={{ color:"#ccc", textAlign:"center", padding:40, fontSize:14 }}>Nog geen afspraken vastgelegd</div>}
                  {(proj.agreements||[]).map(ag => (
                    <div key={ag.id} style={{ background:C.white, borderRadius:12, border:`1px solid ${C.border}`, padding:"14px 20px", marginBottom:8, display:"flex", gap:14, alignItems:"flex-start" }}>
                      <div style={{ width:6, height:6, borderRadius:"50%", background:C.blue, marginTop:7, flexShrink:0 }}></div>
                      <div style={{ flex:1, fontSize:14, color:C.dark }}>{ag.text}</div>
                      <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                        <div style={{ fontSize:12, color:"#bbb", whiteSpace:"nowrap" }}>{fmt(ag.date)}</div>
                        <button onClick={()=>{ setModal("editagreement"); setForm({...ag}); }}
                          style={{ background:"none", border:"none", cursor:"pointer", fontSize:12, color:"#bbb", padding:"2px 4px" }}
                          onMouseEnter={e=>e.target.style.color=C.gold}
                          onMouseLeave={e=>e.target.style.color="#bbb"}>✏</button>
                        <button onClick={()=>deleteAgreement(ag.id)}
                          style={{ background:"none", border:"none", cursor:"pointer", fontSize:13, color:"#ccc", padding:"2px 4px" }}
                          onMouseEnter={e=>e.target.style.color=C.red}
                          onMouseLeave={e=>e.target.style.color="#ccc"}>×</button>
                      </div>
                    </div>
                  ))}
                  <button onClick={()=>{ setModal("agreement"); setForm({ date:new Date().toISOString().split("T")[0], text:"" }); }}
                    style={{ marginTop:8, color:C.gold, background:"none", border:"none", cursor:"pointer", fontSize:14, fontWeight:700 }}>
                    + Afspraak vastleggen
                  </button>
                </div>
              )}

              {/* CONSTATERINGEN */}
              {tab==="roadmap" && (
            <div>
              {proj.roadmap_url ? (
                <iframe src={proj.roadmap_url} style={{ width:"100%", height:"80vh", border:"none", borderRadius:12 }} title="Planning" />
              ) : (
                <div style={{ color:C.mid, textAlign:"center", padding:40 }}>Er is nog geen planning tot start beschikbaar voor dit project.</div>
              )}
            </div>
          )}
            </div>
          )}
          {/* BOUWFOTO'S */}
          {tab==="bouwfotos" && (
            <div>
              {(proj.bouwfotos||[]).length===0 && <div style={{ color:"#ccc", textAlign:"center", padding:40, fontSize:14 }}>Nog geen bouwfoto’s toegevoegd</div>}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(200px, 1fr))", gap:12, marginBottom:12 }}>
                {(proj.bouwfotos||[]).map(f => (
                  <div key={f.id} style={{ background:C.white, borderRadius:10, border:`1px solid ${C.border}`, overflow:"hidden", boxShadow:"0 1px 4px rgba(0,0,0,0.04)" }}>
                    <img src={f.photo} alt={f.caption||""} style={{ width:"100%", height:160, objectFit:"cover", display:"block" }} />
                    <div style={{ padding:"10px 12px" }}>
                      <div style={{ fontSize:13, color:C.dark, fontWeight:600 }}>{f.caption||"Bouwfoto"}</div>
                      <div style={{ fontSize:11, color:"#bbb", marginTop:3 }}>{fmt(f.date)}</div>
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={()=>{ setModal("bouwfoto"); setForm({ date:new Date().toISOString().split("T")[0], caption:"", photo:"" }); }} style={{ marginTop:8, color:C.gold, background:"none", border:"none", cursor:"pointer", fontSize:14, fontWeight:700, display:"flex", alignItems:"center", gap:6 }}>
                + Bouwfoto toevoegen
              </button>
            </div>
          )}
          {tab==="planning" && (
            <div>
              {proj.planning_url ? (
                <iframe src={proj.planning_url} style={{ width:"100%", height:"80vh", border:"none", borderRadius:12 }} title="Planning" />
              ) : (
                <div style={{ color:C.mid, textAlign:"center", padding:40 }}>Er is nog geen planning tot start beschikbaar voor dit project.</div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* MODALS */}
      {(modal==="action"||modal==="editaction") && (
        <Modal title={modal==="editaction"?"Actie bewerken":"Actie toevoegen"} onClose={closeModal} onSave={saveModal} saving={saving}>
          <Field label="Actie" value={form.action||""} onChange={v=>setF("action",v)} placeholder="Wat moet er gebeuren?" />
          <Field label="Eigenaar" value={form.owner||""} onChange={v=>setF("owner",v)} placeholder="Wie pakt dit op?" />
          <Sel label="Status" value={form.status||"Open"} onChange={v=>setF("status",v)} options={["Open","Loopt","Klaar"]} />
          <Field label="Deadline" value={form.deadline||""} onChange={v=>setF("deadline",v)} type="date" />
          <Field label="Notitie" value={form.note||""} onChange={v=>setF("note",v)} placeholder="Context, toelichting..." rows={2} />
          <PhotoUploader value={form.photo||""} onChange={v=>setF("photo",v)} />
        </Modal>
      )}
      {modal==="decision" && (
        <Modal title="Besluit vastleggen" onClose={closeModal} onSave={saveModal} saving={saving}>
          <Field label="Besluit" value={form.text||""} onChange={v=>setF("text",v)} placeholder="Wat is besloten?" rows={3} />
          <Field label="Datum" value={form.date||""} onChange={v=>setF("date",v)} type="date" />
        </Modal>
      )}
      {modal==="agreement" && (
        <Modal title="Afspraak vastleggen" onClose={closeModal} onSave={saveModal} saving={saving}>
          <Field label="Afspraak" value={form.text||""} onChange={v=>setF("text",v)} placeholder="Wat is afgesproken?" rows={3} />
          <Field label="Datum" value={form.date||""} onChange={v=>setF("date",v)} type="date" />
        </Modal>
      )}
      {modal==="constatatie" && (
        <Modal title="Herstelpunt toevoegen" onClose={closeModal} onSave={saveModal} saving={saving}>
          <Field label="Herstelpunt" value={form.text||""} onChange={v=>setF("text",v)} placeholder="Wat is er geconstateerd?" rows={3} />
          <Field label="Datum" value={form.date||""} onChange={v=>setF("date",v)} type="date" />
          <Field label="Onderdeel" value={form.categorie||""} onChange={v=>setF("categorie",v)} placeholder="bv. Schilder, Aannemer..." />
          <Field label="Link snaglijst" value={form.document_url||""} onChange={v=>setF("document_url",v)} type="url" placeholder="https://drive.google.com/..." />
        </Modal>
      )}
      {modal==="editconstatatie" && (
        <Modal title="Herstelpunt bewerken" onClose={closeModal} onSave={saveModal} saving={saving}>
          <Field label="Herstelpunt" value={form.text||""} onChange={v=>setF("text",v)} placeholder="Wat is er geconstateerd?" rows={3} />
          <Field label="Datum" value={form.date||""} onChange={v=>setF("date",v)} type="date" />
        </Modal>
      )}
      {modal==="editdecision" && (
        <Modal title="Besluit bewerken" onClose={closeModal} onSave={saveModal} saving={saving}>
          <Field label="Besluit" value={form.text||""} onChange={v=>setF("text",v)} placeholder="Wat is besloten?" rows={3} />
          <Field label="Datum" value={form.date||""} onChange={v=>setF("date",v)} type="date" />
        </Modal>
      )}
      {modal==="editagreement" && (
        <Modal title="Afspraak bewerken" onClose={closeModal} onSave={saveModal} saving={saving}>
          <Field label="Afspraak" value={form.text||""} onChange={v=>setF("text",v)} placeholder="Wat is afgesproken?" rows={3} />
          <Field label="Datum" value={form.date||""} onChange={v=>setF("date",v)} type="date" />
        </Modal>
      )}
      {modal==="bouwfoto" && (
        <Modal title="Bouwfoto toevoegen" onClose={closeModal} onSave={saveModal} saving={saving}>
          <Field label="Omschrijving" value={form.caption||""} onChange={v=>setF("caption",v)} placeholder="Krate omschrijving van de foto..." />
          <Field label="Datum" value={form.date||""} onChange={v=>setF("date",v)} type="date" />
          <PhotoUploader value={form.photo||""} onChange={v=>setF("photo",v)} />
        </Modal>
      )}
      {modal==="project" && (
        <Modal title="Nieuw project" onClose={closeModal} onSave={saveModal} saving={saving}>
          <Field label="Projectnaam" value={form.name||""} onChange={v=>setF("name",v)} placeholder="Villa ..." />
          <Field label="Klant" value={form.client||""} onChange={v=>setF("client",v)} placeholder="Familie ..." />
          <Sel label="Status" value={form.status||"Ontwerp"} onChange={v=>setF("status",v)} options={["Ontwerp","In uitvoering","Oplevering","On hold"]} />
          <Field label="Fase" value={form.phase||""} onChange={v=>setF("phase",v)} placeholder="bijv. Vergunning, Ruwbouw..." />
          <Field label="Google Drive link" value={form.drive_link||""} onChange={v=>setF("drive_link",v)} placeholder="https://drive.google.com/..." />
        </Modal>
      )}
      {modal==="editproject" && (
        <Modal title="Project bewerken" onClose={closeModal} onSave={saveModal} saving={saving}>
          <Field label="Projectnaam" value={form.name||""} onChange={v=>setF("name",v)} placeholder="Villa ..." />
          <Field label="Klant" value={form.client||""} onChange={v=>setF("client",v)} placeholder="Familie ..." />
          <Sel label="Status" value={form.status||"Ontwerp"} onChange={v=>setF("status",v)} options={["Ontwerp","In uitvoering","Oplevering","On hold"]} />
          <Field label="Fase" value={form.phase||""} onChange={v=>setF("phase",v)} placeholder="bijv. Vergunning, Ruwbouw..." />
          <Field label="Voortgang %" value={String(form.progress||0)} onChange={v=>setF("progress",v)} type="number" placeholder="0" />
          <Field label="Google Drive link" value={form.drive_link||""} onChange={v=>setF("drive_link",v)} placeholder="https://drive.google.com/..." />
        </Modal>
      )}
    </div>
  );
}
