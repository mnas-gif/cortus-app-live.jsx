import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'

// ── Constanten ────────────────────────────────────────────────────────────────

const STATUS_OPTIES = ['Open', 'In uitvoering', 'Gereed']
const STATUS_KLEUR = {
  'Open':         'bg-red-100 text-red-700',
  'In uitvoering':'bg-yellow-100 text-yellow-700',
  'Gereed':       'bg-green-100 text-green-700',
}

const DISCIPLINES = [
  'Bouwkundig', 'Stukadoor', 'Schilderwerk', 'Tegelwerk',
  'Afbouw', 'Installatietechnisch', 'Interieurbouw',
  'Buitenruimte', 'Overig',
]

const VERDIEPINGEN = [
  'Kelder', 'Begane grond', '1e verdieping', 'Zolderverdieping', 'Buitenruimte',
]

const RUIMTES_PER_VERDIEPING = {
  'Kelder':          ['Fitnessruimte', 'Wellnessruimte', 'Zwembad', 'Technische ruimte', 'Bergingsruimte', 'Opslagruimte'],
  'Begane grond':    ['Hal', 'Woonkamer', 'Eetkamer', 'Keuken', 'Kantoor', 'Trappenhuis', 'Toilet', 'Bijkeuken'],
  '1e verdieping':   ['Master bedroom', 'Walk-in closet', 'Master badkamer', 'Slaapkamer 2', 'Slaapkamer 3', 'Badkamer', 'Overloop'],
  'Zolderverdieping':['Zolderruimte', 'Au pair suite'],
  'Buitenruimte':    ['Terras', 'Tuin', 'Carport', 'Bijgebouw', 'Hekwerk / poort'],
}

const MAX_FOTOS = 3
const LEEG_NIEUW = {
  omschrijving: '', verdieping: '', ruimte: '', discipline: '',
  verantwoordelijke: '', verantwoordelijke_email: '',
  deadline: '', status: 'Open', opmerking: '',
  categorie: '', document_url: '',
  fotoFiles: [],
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function deadlineKleur(deadline) {
  if (!deadline) return ''
  const vandaag = new Date(); vandaag.setHours(0, 0, 0, 0)
  return new Date(deadline) < vandaag ? 'text-red-600 font-semibold' : ''
}

function deadlineLabel(deadline) {
  if (!deadline) return '—'
  const vandaag = new Date(); vandaag.setHours(0, 0, 0, 0)
  const label = new Date(deadline).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' })
  return new Date(deadline) < vandaag ? `⚠ ${label}` : label
}

function isGeldigeUrl(str) {
  if (!str) return false
  return str.startsWith('http://') || str.startsWith('https://') || str.startsWith('/')
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function HerstelpuntenTab({ projectId, userEmail, userName, contacts = [], isCortus }) {
  const [punten,         setPunten]         = useState([])
  const [loading,        setLoading]        = useState(true)
  const [filterStatus,   setFilterStatus]   = useState('alle')
  const [filterVerd,     setFilterVerd]     = useState('alle')
  const [filterCategorie,setFilterCategorie]= useState('alle')
  const [lightbox,       setLightbox]       = useState(null)
  const [nieuw,          setNieuw]          = useState(null)
  const [uploading,      setUploading]      = useState(false)
  const [bewerkId,       setBewerkId]       = useState(null)
  const [bewerkTekst,    setBewerkTekst]    = useState('')
  // Categorieën beheer
  const [nieuweCatNaam,  setNieuweCatNaam]  = useState('')
  const [toonNieuweCat,  setToonNieuweCat]  = useState(false)
  const fileInputRef = useRef()

  // ── Data ophalen ──────────────────────────────────────────────────────────

  async function haalOp() {
    setLoading(true)
    const { data, error } = await supabase
      .from('herstelpunten')
      .select('*')
      .eq('project_id', projectId)
      .order('categorie', { ascending: true })
      .order('created_at', { ascending: false })
    if (!error) setPunten(data || [])
    setLoading(false)
  }

  useEffect(() => { haalOp() }, [projectId])

  // ── Beschikbare categorieën uit bestaande punten ──────────────────────────

  const categorieen = [...new Set(punten.map(p => p.categorie).filter(Boolean))].sort()

  // ── Filteren ──────────────────────────────────────────────────────────────

  const verdiepingen = [...new Set(punten.map(p => p.verdieping).filter(Boolean))]

  const zichtbaar = punten.filter(p => {
    const sOk = filterStatus    === 'alle' || p.status    === filterStatus
    const vOk = filterVerd      === 'alle' || p.verdieping === filterVerd
    const cOk = filterCategorie === 'alle' || (p.categorie || '') === filterCategorie
    const eigen = isCortus || p.verantwoordelijke_email === userEmail
    return sOk && vOk && cOk && eigen
  })

  // Groepeer op categorie voor weergave
  const gegroepeerd = zichtbaar.reduce((acc, p) => {
    const cat = p.categorie || ''
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(p)
    return acc
  }, {})
  const catVolgorde = Object.keys(gegroepeerd).sort((a, b) =>
    a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)
  )

  // ── Status bijwerken (iedereen) ───────────────────────────────────────────

  async function updateStatus(id, nieuweStatus) {
    const { error } = await supabase
      .from('herstelpunten')
      .update({ status: nieuweStatus, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (!error) setPunten(prev => prev.map(p => p.id === id ? { ...p, status: nieuweStatus } : p))
  }

  // ── Opmerking opslaan (iedereen) ──────────────────────────────────────────

  async function slaOpmerkingOp(id) {
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('herstelpunten')
      .update({
        opmerking:       bewerkTekst,
        opmerking_door:  userName || userEmail,
        opmerking_datum: now,
        updated_at:      now,
      })
      .eq('id', id)
    if (!error) {
      setPunten(prev => prev.map(p =>
        p.id === id ? { ...p, opmerking: bewerkTekst, opmerking_door: userName || userEmail, opmerking_datum: now } : p
      ))
      setBewerkId(null)
    }
  }

  // ── Verwijderen (alleen Cortus) ───────────────────────────────────────────

  async function verwijder(punt) {
    if (!isCortus || !window.confirm('Herstelpunt verwijderen?')) return
    const alleUrls = [...(punt.foto_urls || []), punt.foto_url].filter(Boolean)
    const paden = alleUrls.map(u => u.split('/herstelpunten-fotos/')[1]).filter(Boolean)
    if (paden.length) await supabase.storage.from('herstelpunten-fotos').remove(paden)
    const { error } = await supabase.from('herstelpunten').delete().eq('id', punt.id)
    if (!error) setPunten(prev => prev.filter(p => p.id !== punt.id))
  }

  // ── Foto upload ───────────────────────────────────────────────────────────

  async function uploadFotos(files) {
    const urls = []
    for (const file of files) {
      const ext = file.name.split('.').pop()
      const pad = `${projectId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage
        .from('herstelpunten-fotos')
        .upload(pad, file, { upsert: false })
      if (!error) {
        const { data: pub } = supabase.storage.from('herstelpunten-fotos').getPublicUrl(pad)
        urls.push(pub.publicUrl)
      }
    }
    return urls
  }

  // ── Nieuw punt ────────────────────────────────────────────────────────────

  function nieuweWaarde(veld, waarde) {
    setNieuw(prev => {
      const bijgewerkt = { ...prev, [veld]: waarde }
      if (veld === 'verdieping') bijgewerkt.ruimte = ''
      if (veld === 'verantwoordelijke') {
        const contact = contacts.find(c => c.naam === waarde)
        bijgewerkt.verantwoordelijke_email = contact?.email || ''
      }
      return bijgewerkt
    })
  }

  function voegFotoToe(e) {
    const files = Array.from(e.target.files)
    const beschikbaar = MAX_FOTOS - nieuw.fotoFiles.length
    setNieuw(prev => ({ ...prev, fotoFiles: [...prev.fotoFiles, ...files.slice(0, beschikbaar)] }))
  }

  async function slaOpNieuw() {
    if (!nieuw.omschrijving.trim()) return
    setUploading(true)
    let fotoUrls = []
    if (nieuw.fotoFiles.length) fotoUrls = await uploadFotos(nieuw.fotoFiles)

    const { data, error } = await supabase.from('herstelpunten').insert({
      project_id:              projectId,
      omschrijving:            nieuw.omschrijving.trim(),
      verdieping:              nieuw.verdieping || '',
      ruimte:                  nieuw.ruimte || '',
      discipline:              nieuw.discipline || '',
      verantwoordelijke:       nieuw.verantwoordelijke || '',
      verantwoordelijke_email: nieuw.verantwoordelijke_email || '',
      deadline:                nieuw.deadline || null,
      status:                  nieuw.status,
      opmerking:               nieuw.opmerking.trim() || '',
      categorie:               nieuw.categorie.trim() || '',
      document_url:            nieuw.document_url.trim() || '',
      foto_urls:               fotoUrls,
      aangemeld_door:          userName || userEmail || 'Mark Nas',
    }).select().single()

    if (!error && data) setPunten(prev => [data, ...prev])
    setNieuw(null)
    setUploading(false)
  }

  // ── Categorie aanmaken via + knop ─────────────────────────────────────────

  function voegCategorieToePersisteer() {
    const naam = nieuweCatNaam.trim()
    if (!naam) return
    // Als we midden in nieuw-formulier zitten, zet direct
    if (nieuw) nieuweWaarde('categorie', naam)
    setNieuweCatNaam('')
    setToonNieuweCat(false)
  }

  // ── Alle foto's van een punt (oud + nieuw veld gecombineerd) ──────────────

  function allefotos(punt) {
    const arr = punt.foto_urls?.length ? punt.foto_urls : []
    if (punt.foto_url && !arr.includes(punt.foto_url)) return [punt.foto_url, ...arr]
    return arr
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-2 flex-wrap items-center">

          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="border rounded px-3 py-1.5 text-sm"
          >
            <option value="alle">Alle statussen</option>
            {STATUS_OPTIES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          {verdiepingen.length > 0 && (
            <select
              value={filterVerd}
              onChange={e => setFilterVerd(e.target.value)}
              className="border rounded px-3 py-1.5 text-sm"
            >
              <option value="alle">Alle verdiepingen</option>
              {verdiepingen.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          )}

          {categorieen.length > 0 && (
            <select
              value={filterCategorie}
              onChange={e => setFilterCategorie(e.target.value)}
              className="border rounded px-3 py-1.5 text-sm"
            >
              <option value="alle">Alle categorieën</option>
              {categorieen.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
        </div>

        <div className="flex gap-2 items-center">
          {/* + Nieuwe categorie aanmaken */}
          {isCortus && (
            toonNieuweCat ? (
              <div className="flex gap-1 items-center">
                <input
                  value={nieuweCatNaam}
                  onChange={e => setNieuweCatNaam(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') voegCategorieToePersisteer(); if (e.key === 'Escape') setToonNieuweCat(false) }}
                  autoFocus
                  placeholder="Naam categorie..."
                  className="border rounded px-3 py-1.5 text-sm w-48"
                />
                <button
                  onClick={voegCategorieToePersisteer}
                  className="bg-gray-600 hover:bg-gray-700 text-white text-sm px-3 py-1.5 rounded"
                >✓</button>
                <button
                  onClick={() => setToonNieuweCat(false)}
                  className="text-sm text-gray-400 hover:text-gray-600 px-2 py-1.5"
                >✕</button>
              </div>
            ) : (
              <button
                onClick={() => setToonNieuweCat(true)}
                className="border border-dashed border-gray-400 text-gray-500 hover:text-gray-700 hover:border-gray-600 text-sm px-3 py-1.5 rounded"
                title="Nieuwe categorie aanmaken"
              >+ Categorie</button>
            )
          )}

          {isCortus && (
            <button
              onClick={() => setNieuw({ ...LEEG_NIEUW })}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-1.5 rounded"
            >
              + Herstelpunt toevoegen
            </button>
          )}
        </div>
      </div>

      {/* Formulier nieuw punt */}
      {nieuw && (
        <div className="border rounded-lg p-4 bg-gray-50 space-y-3">
          <p className="font-semibold text-sm text-gray-700">Nieuw herstelpunt</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

            <div className="md:col-span-2">
              <label className="text-xs text-gray-500">Omschrijving *</label>
              <textarea
                value={nieuw.omschrijving}
                onChange={e => nieuweWaarde('omschrijving', e.target.value)}
                rows={2}
                className="w-full border rounded px-3 py-1.5 text-sm mt-0.5 resize-none"
                placeholder="Beschrijf het herstelpunt..."
              />
            </div>

            {/* Categorie */}
            <div>
              <label className="text-xs text-gray-500">Categorie</label>
              <div className="flex gap-1 mt-0.5">
                <select
                  value={nieuw.categorie}
                  onChange={e => nieuweWaarde('categorie', e.target.value)}
                  className="flex-1 border rounded px-3 py-1.5 text-sm"
                >
                  <option value="">— geen categorie —</option>
                  {categorieen.map(c => <option key={c} value={c}>{c}</option>)}
                  {nieuw.categorie && !categorieen.includes(nieuw.categorie) && (
                    <option value={nieuw.categorie}>{nieuw.categorie} (nieuw)</option>
                  )}
                </select>
                <button
                  type="button"
                  onClick={() => setToonNieuweCat(true)}
                  className="border rounded px-2 py-1.5 text-sm text-gray-500 hover:text-gray-700 hover:border-gray-400"
                  title="Nieuwe categorie aanmaken"
                >+</button>
              </div>
              {toonNieuweCat && (
                <div className="flex gap-1 mt-1">
                  <input
                    value={nieuweCatNaam}
                    onChange={e => setNieuweCatNaam(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') voegCategorieToePersisteer(); if (e.key === 'Escape') setToonNieuweCat(false) }}
                    autoFocus
                    placeholder="Naam nieuwe categorie..."
                    className="flex-1 border rounded px-3 py-1 text-sm"
                  />
                  <button onClick={voegCategorieToePersisteer} className="bg-gray-600 text-white text-sm px-2 py-1 rounded">✓</button>
                  <button onClick={() => setToonNieuweCat(false)} className="text-gray-400 text-sm px-1">✕</button>
                </div>
              )}
            </div>

            {/* Document / snaglijst link */}
            <div>
              <label className="text-xs text-gray-500">Link naar document / snaglijst</label>
              <input
                type="url"
                value={nieuw.document_url}
                onChange={e => nieuweWaarde('document_url', e.target.value)}
                className="w-full border rounded px-3 py-1.5 text-sm mt-0.5"
                placeholder="https://... (PDF, Drive, HTML)"
              />
            </div>

            <div>
              <label className="text-xs text-gray-500">Verdieping</label>
              <select
                value={nieuw.verdieping}
                onChange={e => nieuweWaarde('verdieping', e.target.value)}
                className="w-full border rounded px-3 py-1.5 text-sm mt-0.5"
              >
                <option value="">— kies verdieping —</option>
                {VERDIEPINGEN.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-500">Ruimte</label>
              <select
                value={nieuw.ruimte}
                onChange={e => nieuweWaarde('ruimte', e.target.value)}
                className="w-full border rounded px-3 py-1.5 text-sm mt-0.5"
                disabled={!nieuw.verdieping}
              >
                <option value="">— kies ruimte —</option>
                {(RUIMTES_PER_VERDIEPING[nieuw.verdieping] || []).map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-500">Discipline</label>
              <select
                value={nieuw.discipline}
                onChange={e => nieuweWaarde('discipline', e.target.value)}
                className="w-full border rounded px-3 py-1.5 text-sm mt-0.5"
              >
                <option value="">— kies discipline —</option>
                {DISCIPLINES.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-500">Verantwoordelijke</label>
              <select
                value={nieuw.verantwoordelijke}
                onChange={e => nieuweWaarde('verantwoordelijke', e.target.value)}
                className="w-full border rounded px-3 py-1.5 text-sm mt-0.5"
              >
                <option value="">— kies contact —</option>
                {contacts.map(c => (
                  <option key={c.id} value={c.naam}>{c.naam}{c.rol ? ` (${c.rol})` : ''}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-500">Deadline</label>
              <input
                type="date"
                value={nieuw.deadline}
                onChange={e => nieuweWaarde('deadline', e.target.value)}
                className="w-full border rounded px-3 py-1.5 text-sm mt-0.5"
              />
            </div>

            <div>
              <label className="text-xs text-gray-500">Status</label>
              <select
                value={nieuw.status}
                onChange={e => nieuweWaarde('status', e.target.value)}
                className="w-full border rounded px-3 py-1.5 text-sm mt-0.5"
              >
                {STATUS_OPTIES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-500">Opmerking</label>
              <input
                value={nieuw.opmerking}
                onChange={e => nieuweWaarde('opmerking', e.target.value)}
                className="w-full border rounded px-3 py-1.5 text-sm mt-0.5"
                placeholder="Optionele toelichting..."
              />
            </div>
          </div>

          {/* Foto upload */}
          <div>
            <label className="text-xs text-gray-500">Foto's (max {MAX_FOTOS})</label>
            <div className="flex gap-2 mt-1 flex-wrap items-center">
              {nieuw.fotoFiles.map((f, i) => (
                <div key={i} className="relative">
                  <img src={URL.createObjectURL(f)} alt="" className="w-16 h-16 object-cover rounded border" />
                  <button
                    onClick={() => setNieuw(prev => ({ ...prev, fotoFiles: prev.fotoFiles.filter((_, j) => j !== i) }))}
                    className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 text-xs flex items-center justify-center leading-none"
                  >×</button>
                </div>
              ))}
              {nieuw.fotoFiles.length < MAX_FOTOS && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-16 h-16 border-2 border-dashed rounded flex items-center justify-center text-gray-400 hover:text-gray-500 text-2xl"
                >+</button>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={voegFotoToe} />
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <button onClick={() => setNieuw(null)} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5">
              Annuleren
            </button>
            <button
              onClick={slaOpNieuw}
              disabled={uploading || !nieuw.omschrijving.trim()}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm px-4 py-1.5 rounded"
            >
              {uploading ? 'Opslaan...' : 'Opslaan'}
            </button>
          </div>
        </div>
      )}

      {/* Lijst */}
      {loading ? (
        <p className="text-sm text-gray-400 py-6 text-center">Laden…</p>
      ) : zichtbaar.length === 0 ? (
        <p className="text-sm text-gray-400 py-6 text-center">Geen herstelpunten gevonden.</p>
      ) : (
        <div className="space-y-6">
          {catVolgorde.map(cat => (
            <div key={cat}>
              {/* Categorie header */}
              {cat ? (
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">{cat}</h3>
                  <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">
                    {gegroepeerd[cat].filter(p => p.status !== 'Gereed').length} open
                    {gegroepeerd[cat].some(p => p.document_url) && (
                      <a
                        href={gegroepeerd[cat].find(p => p.document_url)?.document_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 text-blue-500 hover:text-blue-700"
                        title="Snaglijst / document openen"
                        onClick={e => e.stopPropagation()}
                      >🔗 document</a>
                    )}
                  </span>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>
              ) : (
                categorieen.length > 0 && (
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide italic">Zonder categorie</h3>
                    <div className="flex-1 h-px bg-gray-100" />
                  </div>
                )
              )}

              {/* Tabel per categorie */}
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
                      <th className="px-4 py-3 font-medium">Herstelpunt</th>
                      <th className="px-4 py-3 font-medium">Locatie</th>
                      <th className="px-4 py-3 font-medium">Discipline</th>
                      <th className="px-4 py-3 font-medium">Verantwoordelijke</th>
                      <th className="px-4 py-3 font-medium">Deadline</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      {isCortus && <th className="px-4 py-3"></th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {gegroepeerd[cat].map(punt => {
                      const fotos = allefotos(punt)
                      return (
                        <tr key={punt.id} className="hover:bg-gray-50 align-top">

                          {/* Omschrijving + document link + fotos + opmerking */}
                          <td className="px-4 py-3 max-w-xs">
                            <div className="flex items-start gap-2">
                              <p className="font-medium text-gray-900 leading-snug flex-1">{punt.omschrijving}</p>
                              {isGeldigeUrl(punt.document_url) && (
                                <a
                                  href={punt.document_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex-shrink-0 text-blue-500 hover:text-blue-700 mt-0.5"
                                  title="Document / snaglijst openen"
                                  onClick={e => e.stopPropagation()}
                                >
                                  🔗
                                </a>
                              )}
                            </div>

                            {fotos.length > 0 && (
                              <div className="flex gap-1 mt-1.5 flex-wrap">
                                {fotos.map((url, i) => (
                                  <img
                                    key={i} src={url} alt=""
                                    className="w-10 h-10 object-cover rounded border cursor-pointer hover:opacity-80"
                                    onClick={() => setLightbox({ url, naam: punt.omschrijving })}
                                  />
                                ))}
                              </div>
                            )}

                            {/* Opmerking inline */}
                            {bewerkId === punt.id ? (
                              <div className="mt-2 flex gap-1">
                                <input
                                  value={bewerkTekst}
                                  onChange={e => setBewerkTekst(e.target.value)}
                                  className="border rounded px-2 py-1 text-xs flex-1"
                                  placeholder="Opmerking..."
                                  autoFocus
                                  onKeyDown={e => e.key === 'Enter' && slaOpmerkingOp(punt.id)}
                                />
                                <button onClick={() => slaOpmerkingOp(punt.id)} className="bg-blue-600 text-white text-xs px-2 py-1 rounded">✓</button>
                                <button onClick={() => setBewerkId(null)} className="text-gray-400 text-xs px-1">✕</button>
                              </div>
                            ) : (
                              <div
                                className="mt-1.5 text-xs cursor-pointer"
                                onClick={() => { setBewerkId(punt.id); setBewerkTekst(punt.opmerking || '') }}
                                title={punt.opmerking_door ? `${punt.opmerking_door} — klik om te wijzigen` : 'Klik om opmerking toe te voegen'}
                              >
                                {punt.opmerking
                                  ? <span className="text-gray-500">💬 {punt.opmerking}</span>
                                  : <span className="text-gray-300 hover:text-gray-400">+ opmerking</span>
                                }
                              </div>
                            )}
                          </td>

                          {/* Locatie */}
                          <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                            {punt.verdieping && punt.ruimte
                              ? <><span className="font-medium">{punt.verdieping}</span><br/><span className="text-gray-400">{punt.ruimte}</span></>
                              : punt.verdieping || punt.ruimte || <span className="text-gray-300">—</span>
                            }
                          </td>

                          {/* Discipline */}
                          <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                            {punt.discipline || <span className="text-gray-300">—</span>}
                          </td>

                          {/* Verantwoordelijke */}
                          <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                            {punt.verantwoordelijke || <span className="text-gray-300">—</span>}
                          </td>

                          {/* Deadline */}
                          <td className={`px-4 py-3 whitespace-nowrap ${deadlineKleur(punt.deadline)}`}>
                            {deadlineLabel(punt.deadline)}
                          </td>

                          {/* Status dropdown */}
                          <td className="px-4 py-3">
                            <select
                              value={punt.status}
                              onChange={e => updateStatus(punt.id, e.target.value)}
                              disabled={punt.status === 'Gereed' && !isCortus}
                              className={`text-xs font-medium rounded px-2 py-1 border-0 cursor-pointer ${STATUS_KLEUR[punt.status] || ''}`}
                            >
                              {STATUS_OPTIES.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </td>

                          {/* Verwijder (alleen Cortus) */}
                          {isCortus && (
                            <td className="px-4 py-3 text-right">
                              <button
                                onClick={() => verwijder(punt)}
                                className="text-gray-300 hover:text-red-500 transition-colors text-lg leading-none"
                                title="Verwijderen"
                              >✕</button>
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <div className="relative max-w-3xl max-h-full" onClick={e => e.stopPropagation()}>
            <img src={lightbox.url} alt={lightbox.naam} className="max-w-full max-h-[80vh] rounded-lg object-contain" />
            <p className="text-white text-sm mt-2 text-center opacity-75">{lightbox.naam}</p>
            <button
              onClick={() => setLightbox(null)}
              className="absolute -top-3 -right-3 bg-white text-gray-800 rounded-full w-7 h-7 flex items-center justify-center text-sm font-bold hover:bg-gray-100"
            >✕</button>
          </div>
        </div>
      )}
    </div>
  )
}
