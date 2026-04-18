import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FileText, BrainCircuit, CheckCircle2, DollarSign, Scale, MessageSquare, UploadCloud, Clock, FileUp, Check, Download, X, ArrowLeft, Folder } from 'lucide-react'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { useView } from '@/context/ViewContext'
import { mockProcessos } from '@/data/mockData'
import { obterCaso, decidir, obterMetricas } from '@/services/casosService'
import type { ShapInfo, Metricas } from '@/types/backend'

const POLITICAS = ['Conservadora', 'Moderada', 'Balanceada', 'Agressiva', 'Maxima'] as const
type NomePolitica = typeof POLITICAS[number]

interface PayloadProcesso {
  uf: string
  sub_assunto: string
  valor_causa: number
  features_documentais: Record<string, unknown>
}

interface AnaliseState {
  numeroCaso: string
  decisao: 'ACORDO' | 'DEFESA'
  probabilidadePerda: number
  valorAcordoSugerido: number | null
  sugestoes: { valor: number; probabilidadeSucesso: number }[]
  explicacao: string
}

// ─── Mock de Casos ────────────────────────────────────────────────────────────

interface CasoMock {
  id: string
  nome: string
  status: 'Analisado' | 'Não analisado'
  dadosPreenchidos: AnaliseState | null
}

const CASOS_MOCK: CasoMock[] = [
  {
    id: 'caso_01',
    nome: 'Caso 01',
    status: 'Analisado',
    dadosPreenchidos: {
      numeroCaso: '1764352-89.2025.8.06.1818',
      decisao: 'ACORDO',
      probabilidadePerda: 0.78,
      valorAcordoSugerido: 12500,
      sugestoes: [
        { valor: 12500, probabilidadeSucesso: 70 },
        { valor: 9000,  probabilidadeSucesso: 90 },
        { valor: 16000, probabilidadeSucesso: 40 },
      ],
      explicacao: 'Alta probabilidade de perda — histórico de casos similares no CE e ausência de contrato assinado.',
    },
  },
  {
    id: 'caso_02',
    nome: 'Caso 02',
    status: 'Não analisado',
    dadosPreenchidos: null,
  },
]

const BLANK_ANALISE: AnaliseState = {
  numeroCaso: '—',
  decisao: 'DEFESA',
  probabilidadePerda: 0,
  valorAcordoSugerido: null,
  sugestoes: [],
  explicacao: '',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function decisaoParaAnalise(d: {
  decisao: 'ACORDO' | 'DEFESA'
  probabilidade_perda: number
  valor_acordo_sugerido: number | null
  valor_condenacao_faixa: [number, number]
  explicacao: string
}, numeroCaso: string): AnaliseState {
  const alpha = 0.5
  const [p10, p90] = d.valor_condenacao_faixa
  return {
    numeroCaso,
    decisao: d.decisao,
    probabilidadePerda: d.probabilidade_perda,
    valorAcordoSugerido: d.valor_acordo_sugerido,
    sugestoes: d.decisao === 'ACORDO' ? [
      { valor: d.valor_acordo_sugerido!, probabilidadeSucesso: 70 },
      { valor: Math.round(p10 * alpha), probabilidadeSucesso: 90 },
      { valor: Math.round(p90 * alpha), probabilidadeSucesso: 40 },
    ] : [],
    explicacao: d.explicacao,
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ProcessAnalysisPage() {
  const [decision, setDecision] = useState<'acordo' | 'defesa' | null>(null)
  const { userRole } = useView()
  const [searchParams] = useSearchParams()

  // ── Master-Detail state ──
  const [selectedCase, setSelectedCase] = useState<CasoMock | null>(null)

  // ── Detail state ──
  const processoMock = mockProcessos[0]!
  const mockSugestoes = processoMock.sugestoesValor || []
  const mockValorIdeal = mockSugestoes.length > 0 ? mockSugestoes[0].valor : 85000

  const fallback: AnaliseState = {
    numeroCaso: processoMock.numeroCaso,
    decisao: 'ACORDO',
    probabilidadePerda: (processoMock.scoreRisco ?? 78) / 100,
    valorAcordoSugerido: processoMock.valorAcordoSugerido,
    sugestoes: mockSugestoes,
    explicacao: '',
  }

  const [analise, setAnalise] = useState<AnaliseState>(fallback)
  const [payload, setPayload] = useState<PayloadProcesso | null>(null)
  const [politicaSelecionada, setPoliticaSelecionada] = useState<NomePolitica>('Balanceada')
  const [loadingPolitica, setLoadingPolitica] = useState(false)
  const [shap, setShap] = useState<ShapInfo | null>(null)
  const [metricas, setMetricas] = useState<Metricas | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [valorSelecionado, setValorSelecionado] = useState<number>(mockValorIdeal)
  const [modalSelection, setModalSelection] = useState<number>(mockValorIdeal)

  const aplicarResultado = useCallback((estado: AnaliseState) => {
    const novoValor = estado.valorAcordoSugerido ?? 0
    setAnalise(estado)
    setValorSelecionado(novoValor)
    setModalSelection(novoValor)
  }, [])

  // Quando um caso é selecionado, preenche o detalhe com os dados do mock
  useEffect(() => {
    if (!selectedCase) return
    setShap(null)
    setDecision(null)
    if (selectedCase.dadosPreenchidos) {
      aplicarResultado(selectedCase.dadosPreenchidos)
    } else {
      aplicarResultado(BLANK_ANALISE)
    }
  }, [selectedCase, aplicarResultado])

  // Busca métricas do modelo uma vez
  useEffect(() => {
    obterMetricas().then(setMetricas).catch(() => {})
  }, [])

  // Carrega o caso inicial pelo slug (via URL ?id=)
  useEffect(() => {
    const id = searchParams.get('id')
    if (!id || !id.startsWith('caso_')) return
    obterCaso(id).then(pip => {
      const p = pip.payload as PayloadProcesso
      setPayload(p)
      aplicarResultado(decisaoParaAnalise(pip.decisao, pip.processo_id))
      decidir({
        uf: p.uf,
        sub_assunto: p.sub_assunto,
        valor_causa: p.valor_causa,
        policy: 'Balanceada',
        include_shap: true,
        features_documentais: p.features_documentais,
      }).then(d => { if (d.shap) setShap(d.shap) }).catch(() => {})
    }).catch(() => { /* fica no fallback */ })
  }, [searchParams, aplicarResultado])

  // Re-chama /decidir quando a política muda (e temos um payload real)
  useEffect(() => {
    if (!payload) return
    setLoadingPolitica(true)
    decidir({
      uf: payload.uf,
      sub_assunto: payload.sub_assunto,
      valor_causa: payload.valor_causa,
      policy: politicaSelecionada,
      include_shap: true,
      features_documentais: payload.features_documentais,
    }).then(d => {
      aplicarResultado(decisaoParaAnalise(d as any, analise.numeroCaso))
      if (d.shap) setShap(d.shap)
    }).catch(() => {}).finally(() => setLoadingPolitica(false))
  }, [politicaSelecionada]) // eslint-disable-line react-hooks/exhaustive-deps

  const sugestoes = analise.sugestoes
  const valorIdeal = analise.valorAcordoSugerido ?? 0

  // ── MASTER VIEW ──────────────────────────────────────────────────────────────
  if (selectedCase === null) {
    return (
      <DashboardLayout pageTitle="Casos em Aberto">
        <div className="flex flex-col gap-6">
          <p className="text-sm text-slate-500">Selecione um caso para ver ou iniciar a análise.</p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {CASOS_MOCK.map(caso => {
              const analisado = caso.status === 'Analisado'
              return (
                <div
                  key={caso.id}
                  className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden hover:shadow-md transition-shadow"
                >
                  {/* Card header */}
                  <div className="p-5 flex-1 flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-blue-50 rounded-xl">
                          <Folder size={20} className="text-blue-600" />
                        </div>
                        <h3 className="font-semibold text-slate-800 text-base">{caso.nome}</h3>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border shrink-0 ${
                          analisado
                            ? 'text-green-700 bg-green-50 border-green-200'
                            : 'text-slate-500 bg-slate-100 border-slate-200'
                        }`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-current" />
                        {caso.status}
                      </span>
                    </div>

                    <p className="text-xs text-slate-400 leading-relaxed">
                      {analisado
                        ? 'Análise concluída pelo motor de IA. Clique para visualizar o resultado.'
                        : 'Aguardando análise. Clique para iniciar o processamento do caso.'}
                    </p>
                  </div>

                  {/* Card footer */}
                  <div className="px-5 pb-5">
                    <button
                      onClick={() => setSelectedCase(caso)}
                      className={`w-full py-2.5 rounded-xl font-semibold text-sm transition-all ${
                        analisado
                          ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
                          : 'bg-slate-800 hover:bg-slate-900 text-white shadow-sm'
                      }`}
                    >
                      {analisado ? 'Ver análise' : 'Analisar'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </DashboardLayout>
    )
  }

  // ── DETAIL VIEW ───────────────────────────────────────────────────────────────
  return (
    <DashboardLayout pageTitle={`Análise de Processo · ${selectedCase.nome}`}>
      <div className="flex flex-col gap-6 flex-1 min-h-0 overflow-y-auto pb-6">

        {/* Voltar */}
        <button
          onClick={() => setSelectedCase(null)}
          className="self-start inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-200 hover:border-slate-300 px-3 py-1.5 rounded-lg shadow-sm transition-all"
        >
          <ArrowLeft size={15} />
          Voltar para a lista
        </button>

        {/* SEÇÃO SUPERIOR: Recomendação da IA (Largura Total) */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col shrink-0">
          <div className="bg-blue-50 border-b border-blue-100 px-5 py-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-600 rounded-lg text-white shadow-sm">
                <BrainCircuit size={20} />
              </div>
              <div>
                <h2 className="font-semibold text-blue-900 leading-tight">Inteligência Artificial Banco UFMG</h2>
                <p className="text-xs text-blue-700 font-medium">Recomendação Estratégica e Veredito · {analise.numeroCaso}</p>
              </div>
            </div>
            {payload && (
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Política:</label>
                <select
                  value={politicaSelecionada}
                  onChange={e => setPoliticaSelecionada(e.target.value as NomePolitica)}
                  disabled={loadingPolitica}
                  className="text-sm font-medium text-blue-900 bg-white border border-blue-200 rounded-lg px-3 py-1.5 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50 cursor-pointer"
                >
                  {POLITICAS.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                {loadingPolitica && <span className="text-xs text-blue-500 animate-pulse">calculando...</span>}
              </div>
            )}
          </div>

          <div className="p-8 flex flex-col gap-8">
            {/* Resumo do Caso */}
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Resumo do Caso</p>
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-sm text-slate-700 leading-relaxed shadow-sm">
                {selectedCase.dadosPreenchidos
                  ? 'A parte autora alega não reconhecer a contratação do empréstimo consignado, contestando os descontos realizados em sua conta bancária. Requer indenização por danos materiais e morais.'
                  : <span className="text-slate-400 italic">Resumo não disponível — caso ainda não analisado.</span>}
              </div>
            </div>

            {/* Grid 3 colunas para Veredito, Valores e Ações */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
              {/* Veredito */}
              <div className="flex flex-col h-full">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Veredito Sugerido</p>
                <div className={`flex items-start gap-3 p-4 rounded-xl flex-1 border ${analise.decisao === 'ACORDO' ? 'bg-green-50 border-green-100' : 'bg-slate-50 border-slate-200'}`}>
                  <CheckCircle2 className={`mt-0.5 shrink-0 ${analise.decisao === 'ACORDO' ? 'text-green-600' : 'text-slate-500'}`} size={20} />
                  <div>
                    <span className={`font-bold text-lg ${analise.decisao === 'ACORDO' ? 'text-green-800' : 'text-slate-800'}`}>
                      {selectedCase.dadosPreenchidos
                        ? (analise.decisao === 'ACORDO' ? 'Propor Acordo' : 'Manter Defesa')
                        : '—'}
                    </span>
                    <p className={`text-sm mt-1 leading-relaxed ${analise.decisao === 'ACORDO' ? 'text-green-700' : 'text-slate-600'}`}>
                      {selectedCase.dadosPreenchidos
                        ? `Probabilidade de perda prevista: ${(analise.probabilidadePerda * 100).toFixed(0)}%${analise.explicacao ? ` — ${analise.explicacao}` : ''}`
                        : 'Aguardando análise do motor de IA.'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Valores */}
              <div className="flex flex-col h-full">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Sugestão de Valor</p>
                <div className="flex flex-col gap-3 flex-1 justify-center">
                  <div className="p-4 border border-blue-200 rounded-xl bg-blue-50 flex flex-col justify-center transition-colors hover:bg-blue-100 cursor-default flex-1">
                    <div className="flex flex-col gap-2 w-full h-full justify-center">
                      <p className="text-sm text-blue-600 font-medium flex items-center gap-1">
                        <DollarSign size={16}/> Valor selecionado para o acordo
                      </p>
                      {selectedCase.dadosPreenchidos
                        ? <p className="font-bold text-blue-800 text-2xl">{valorSelecionado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                        : <p className="text-slate-400 italic text-sm">Não disponível</p>}
                    </div>
                    {sugestoes.length > 0 && (
                      <button
                        onClick={() => {
                          setModalSelection(valorSelecionado)
                          setIsModalOpen(true)
                        }}
                        className="mt-3 text-[12px] text-blue-600 hover:text-blue-800 hover:underline self-start font-medium transition-colors"
                      >
                        Ver todos os valores sugeridos
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Ação Baseada no Perfil */}
              <div className="flex flex-col h-full md:border-l md:border-slate-100 md:pl-6">
                {userRole === 'advogado' ? (
                  <>
                    <p className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">Decisão Final do Escritório</p>
                    <div className="grid grid-cols-2 gap-3 flex-1">
                      <button
                        onClick={() => setDecision('acordo')}
                        className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all h-full ${
                          decision === 'acordo'
                            ? 'border-green-600 bg-green-50 text-green-700 shadow-sm'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-green-300 hover:bg-green-50'
                        }`}
                      >
                        <MessageSquare size={20} className="mb-1" />
                        <span className="font-semibold text-sm">Aceitar (Acordo)</span>
                      </button>

                      <button
                        onClick={() => setDecision('defesa')}
                        className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all h-full ${
                          decision === 'defesa'
                            ? 'border-red-600 bg-red-50 text-red-700 shadow-sm'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-red-300 hover:bg-red-50'
                        }`}
                      >
                        <Scale size={20} className="mb-1" />
                        <span className="font-semibold text-sm">Recusar (Defesa)</span>
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">Status da Análise Externo</p>
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col items-center justify-center text-center flex-1 shadow-sm">
                      <Clock className="text-amber-500 mb-2" size={24} />
                      <p className="font-semibold text-amber-800">Em Processamento</p>
                      <p className="text-sm text-amber-700 mt-1 max-w-sm">Aguardando análise e parecer final do escritório de advocacia responsável pelo caso.</p>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Fatores Determinantes (SHAP) + Confiabilidade do Modelo */}
            {(shap?.disponivel || metricas) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {shap?.disponivel && shap.top_features_p_l && (
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Fatores Determinantes (P. Perda)</p>
                    <div className="space-y-2">
                      {shap.top_features_p_l.map((f) => {
                        const pct = Math.min(Math.abs(f.contribuicao) * 400, 100)
                        const positivo = f.contribuicao > 0
                        return (
                          <div key={f.feature} className="flex items-center gap-3">
                            <span className="text-xs text-slate-500 w-36 truncate shrink-0" title={f.feature}>{f.feature}</span>
                            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${positivo ? 'bg-red-400' : 'bg-green-400'}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className={`text-xs font-semibold w-14 text-right ${positivo ? 'text-red-600' : 'text-green-600'}`}>
                              {positivo ? '+' : ''}{f.contribuicao.toFixed(3)}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-2">Vermelho aumenta risco · Verde reduz risco</p>
                  </div>
                )}

                {metricas && (
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Confiabilidade do Modelo</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                        <p className="text-[10px] text-slate-400 uppercase tracking-wide">AUC-ROC</p>
                        <p className="font-bold text-slate-800 text-lg">{metricas.modelo_a.auc_roc.toFixed(3)}</p>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                        <p className="text-[10px] text-slate-400 uppercase tracking-wide">Calibração (ECE)</p>
                        <p className="font-bold text-slate-800 text-lg">{metricas.modelo_a.ece.toFixed(3)}</p>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                        <p className="text-[10px] text-slate-400 uppercase tracking-wide">MAE Condenação</p>
                        <p className="font-bold text-slate-800 text-lg">R$ {metricas.modelo_b.mae.toLocaleString('pt-BR')}</p>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                        <p className="text-[10px] text-slate-400 uppercase tracking-wide">Cobertura IC 80%</p>
                        <p className="font-bold text-slate-800 text-lg">{(metricas.quantis.cobertura_ic80 * 100).toFixed(1)}%</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* SEÇÃO INFERIOR: Arquivos e Gestão */}
        {userRole === 'banco' ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-[400px]">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full">
              <div className="bg-slate-50 border-b border-slate-200 px-5 py-4 flex items-center gap-2">
                <FileText className="text-slate-500" size={18} />
                <h3 className="font-semibold text-slate-800">Subsídios e Autos</h3>
              </div>
              <div className="p-5 flex-1 overflow-y-auto">
                <div className="space-y-3">
                  {[
                    { name: 'Contrato_Financiamento_Assinado.pdf', info: 'Banco UFMG • 1.2 MB' },
                    { name: 'Extrato_Movimentacao_2023.pdf',        info: 'Banco UFMG • 850 KB' },
                    { name: 'Peticao_Inicial_Autos.pdf',            info: 'Documento do Tribunal • 2.1 MB' },
                  ].map(file => (
                    <div key={file.name} className="flex items-center justify-between p-3 border border-slate-200 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all cursor-pointer group">
                      <div className="flex items-center gap-4">
                        <div className="bg-red-50 text-red-600 p-2.5 rounded-lg group-hover:scale-110 transition-transform">
                          <FileText size={20} />
                        </div>
                        <div>
                          <p className="font-medium text-sm text-slate-800 group-hover:text-blue-700 transition-colors">{file.name}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{file.info}</p>
                        </div>
                      </div>
                      <button className="text-slate-400 group-hover:text-blue-600 p-2 rounded-md transition-colors" title="Baixar documento">
                        <Download size={18} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full">
              <div className="bg-slate-50 border-b border-slate-200 px-5 py-4 flex items-center gap-2">
                <UploadCloud className="text-slate-500" size={18} />
                <h3 className="font-semibold text-slate-800">Gestão de Subsídios</h3>
              </div>
              <div className="p-5 flex flex-col gap-5 flex-1">
                <div className="flex-1 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 flex flex-col items-center justify-center p-6 text-center hover:bg-slate-100 hover:border-blue-400 transition-all cursor-pointer group">
                  <div className="p-3 bg-white rounded-full shadow-sm mb-3 group-hover:scale-110 transition-transform">
                    <FileUp size={24} className="text-blue-600" />
                  </div>
                  <h4 className="font-medium text-slate-800 mb-1">Adicionar Novos Subsídios</h4>
                  <p className="text-xs text-slate-500 mb-4">Arraste e solte arquivos PDF, JPG ou PNG (Max. 10MB)</p>
                  <button className="bg-white border border-slate-200 hover:border-blue-300 hover:text-blue-700 text-slate-700 font-medium py-2 px-4 rounded-lg shadow-sm transition-all text-sm flex items-center gap-2">
                    <UploadCloud size={16} />
                    Procurar Arquivos
                  </button>
                </div>
                <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-xl transition-colors shadow-sm flex items-center justify-center gap-2">
                  <Check size={18} />
                  Confirmar Subsídios
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col flex-1 min-h-[400px]">
            <div className="bg-slate-50 border-b border-slate-200 px-5 py-4 flex items-center gap-2">
              <FileText className="text-slate-500" size={18} />
              <h3 className="font-semibold text-slate-800">Subsídios e Autos Disponíveis</h3>
            </div>
            <div className="p-6 flex-1 overflow-y-auto bg-slate-50/50">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[
                  { name: 'Contrato_Financiamento_Assinado.pdf', info: 'Banco UFMG • 1.2 MB' },
                  { name: 'Extrato_Movimentacao_2023.pdf',        info: 'Banco UFMG • 850 KB' },
                  { name: 'Peticao_Inicial_Autos.pdf',            info: 'Documento do Tribunal • 2.1 MB' },
                ].map(file => (
                  <div key={file.name} className="bg-white border border-slate-200 rounded-xl p-5 hover:border-blue-300 hover:shadow-md transition-all group flex flex-col justify-between h-full relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="flex items-start gap-4 mb-5 relative z-10">
                      <div className="bg-red-50 text-red-600 p-3 rounded-xl group-hover:scale-110 transition-transform">
                        <FileText size={24} />
                      </div>
                      <div>
                        <p className="font-semibold text-sm text-slate-800 group-hover:text-blue-700 transition-colors line-clamp-2">{file.name}</p>
                        <p className="text-xs text-slate-500 mt-1">{file.info}</p>
                      </div>
                    </div>
                    <button className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-slate-200 text-slate-600 font-medium text-sm hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-all relative z-10">
                      <Download size={16} />
                      Visualizar Documento
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Modal de Múltiplas Sugestões */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] overflow-hidden flex flex-col">
              <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center shrink-0">
                <h3 className="font-bold text-slate-800 text-lg">Análise de Valores de Acordo</h3>
                <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-md transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 flex flex-col gap-4 overflow-y-auto">
                <p className="text-sm text-slate-500 mb-2">A inteligência artificial gerou múltiplos cenários para acordo neste caso. Selecione a opção mais adequada à estratégia.</p>

                <div className="space-y-3">
                  {sugestoes.map((sugestao, idx) => {
                    const isRecommended = idx === 0
                    const isSelected = modalSelection === sugestao.valor
                    return (
                      <label
                        key={idx}
                        className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all ${
                          isSelected ? 'border-blue-500 bg-blue-50/50' : 'border-slate-200 hover:border-blue-200 hover:bg-slate-50'
                        }`}
                        onClick={() => setModalSelection(sugestao.valor)}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="radio"
                            name="suggestedValue"
                            checked={isSelected}
                            readOnly
                            className="w-4 h-4 text-blue-600 border-slate-300 focus:ring-blue-500"
                          />
                          <div>
                            <p className={`font-bold ${isSelected ? 'text-blue-900' : 'text-slate-800'}`}>
                              {sugestao.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </p>
                            {isRecommended && (
                              <span className="inline-block mt-1 text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full uppercase tracking-wider">
                                Recomendado
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col items-end">
                          <div className={`text-sm font-bold ${sugestao.probabilidadeSucesso >= 70 ? 'text-green-600' : sugestao.probabilidadeSucesso >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                            {sugestao.probabilidadeSucesso}%
                          </div>
                          <p className="text-[10px] text-slate-500 uppercase tracking-wide">Sucesso</p>
                        </div>
                      </label>
                    )
                  })}
                </div>
              </div>

              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 shrink-0">
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg font-medium text-sm text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors shadow-sm"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    setValorSelecionado(modalSelection)
                    setIsModalOpen(false)
                  }}
                  className="px-6 py-2 rounded-lg font-medium text-sm text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition-colors"
                >
                  Confirmar Seleção
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
