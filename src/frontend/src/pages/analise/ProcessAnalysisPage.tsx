import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import {
  FileText,
  BrainCircuit,
  CheckCircle2,
  DollarSign,
  Scale,
  MessageSquare,
  UploadCloud,
  Clock,
  FileUp,
  Check,
  Download,
  X,
  ArrowLeft,
  Folder,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useView } from "@/context/ViewContext";
import { mockProcessos } from "@/data/mockData";
import { obterCaso, decidir, obterMetricas, listarArquivosCaso } from "@/services/casosService";
import { salvarDecisaoEscritorio } from "@/services/api";
import type { ArquivoCaso, ShapInfo, Metricas, JurisprudenciaRef } from "@/types/backend";

const POLITICAS = ["Conservadora", "Moderada", "Arriscada"] as const;
type NomePolitica = (typeof POLITICAS)[number];

interface PayloadProcesso {
  uf: string;
  sub_assunto: string;
  valor_causa: number;
  features_documentais: Record<string, unknown>;
}

interface AnaliseState {
  numeroCaso: string;
  decisao: "ACORDO" | "DEFESA";
  probabilidadePerda: number;
  valorAcordoSugerido: number | null;
  sugestoes: { valor: number; probabilidadeSucesso: number }[];
  explicacao: string;
}

// ─── Mock de Casos ────────────────────────────────────────────────────────────

interface CasoMock {
  id: string;
  nome: string;
  status: "Analisado" | "Não analisado";
  dadosPreenchidos: AnaliseState | null;
}

const CASOS_MOCK: CasoMock[] = [
  {
    id: "caso_01",
    nome: "Caso 01",
    status: "Analisado",
    dadosPreenchidos: {
      numeroCaso: "1764352-89.2025.8.06.1818",
      decisao: "ACORDO",
      probabilidadePerda: 0.78,
      valorAcordoSugerido: 12500,
      sugestoes: [
        { valor: 12500, probabilidadeSucesso: 70 },
        { valor: 9000, probabilidadeSucesso: 90 },
        { valor: 16000, probabilidadeSucesso: 40 },
      ],
      explicacao:
        "Alta probabilidade de perda — histórico de casos similares no CE e ausência de contrato assinado.",
    },
  },
  {
    id: "caso_02",
    nome: "Caso 02",
    status: "Não analisado",
    dadosPreenchidos: null,
  },
];

const BLANK_ANALISE: AnaliseState = {
  numeroCaso: "—",
  decisao: "DEFESA",
  probabilidadePerda: 0,
  valorAcordoSugerido: null,
  sugestoes: [],
  explicacao: "",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function decisaoParaAnalise(
  d: {
    decisao: "ACORDO" | "DEFESA";
    probabilidade_perda: number;
    valor_acordo_sugerido: number | null;
    valor_condenacao_faixa: [number, number];
    explicacao: string;
  },
  numeroCaso: string,
): AnaliseState {
  const alpha = 0.5;
  const [p10, p90] = d.valor_condenacao_faixa;
  return {
    numeroCaso,
    decisao: d.decisao,
    probabilidadePerda: d.probabilidade_perda,
    valorAcordoSugerido: d.valor_acordo_sugerido,
    sugestoes:
      d.decisao === "ACORDO"
        ? [
            { valor: d.valor_acordo_sugerido!, probabilidadeSucesso: 70 },
            { valor: Math.round(p10 * alpha), probabilidadeSucesso: 90 },
            { valor: Math.round(p90 * alpha), probabilidadeSucesso: 40 },
          ]
        : [],
    explicacao: d.explicacao,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ProcessAnalysisPage() {
  const [decision, setDecision] = useState<"acordo" | "defesa" | null>(null);
  const { userRole } = useView();
  const [searchParams] = useSearchParams();

  // ── Master-Detail state ──
  const [selectedCase, setSelectedCase] = useState<CasoMock | null>(null);

  // ── Detail state ──
  const processoMock = mockProcessos[0]!;
  const mockSugestoes = processoMock.sugestoesValor || [];
  const mockValorIdeal =
    mockSugestoes.length > 0 ? mockSugestoes[0].valor : 85000;

  const fallback: AnaliseState = {
    numeroCaso: processoMock.numeroCaso,
    decisao: "ACORDO",
    probabilidadePerda: (processoMock.scoreRisco ?? 78) / 100,
    valorAcordoSugerido: processoMock.valorAcordoSugerido,
    sugestoes: mockSugestoes,
    explicacao: "",
  };

  const [analise, setAnalise] = useState<AnaliseState>(fallback);
  const [payload, setPayload] = useState<PayloadProcesso | null>(null);
  const [politicaSelecionada, setPoliticaSelecionada] =
    useState<NomePolitica>("Moderada");
  const [loadingPolitica, setLoadingPolitica] = useState(false);
  const [shap, setShap] = useState<ShapInfo | null>(null);
  const [metricas, setMetricas] = useState<Metricas | null>(null);
  const [jurisprudencias, setJurisprudencias] = useState<JurisprudenciaRef[]>(
    [],
  );
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAnalyzeModalOpen, setIsAnalyzeModalOpen] = useState(false);
  const [pendingCase, setPendingCase] = useState<CasoMock | null>(null);
  const [actionModalState, setActionModalState] = useState<
    "none" | "accept" | "reject"
  >("none");
  const [valorSelecionado, setValorSelecionado] =
    useState<number>(mockValorIdeal);
  const [modalSelection, setModalSelection] = useState<number>(mockValorIdeal);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [arquivos, setArquivos] = useState<ArquivoCaso[]>([]);
  const [pdfPreview, setPdfPreview] = useState<{ url: string; nome: string } | null>(null);
  const [caseAnalyzed, setCaseAnalyzed] = useState(false);
  const [isLoadingCase, setIsLoadingCase] = useState(false);

  const aplicarResultado = useCallback((estado: AnaliseState) => {
    const novoValor = estado.valorAcordoSugerido ?? 0;
    setAnalise(estado);
    setValorSelecionado(novoValor);
    setModalSelection(novoValor);
  }, []);

  // Quando um caso é selecionado, preenche o detalhe com os dados do mock
  // e busca jurisprudências via API — chama o motor de IA para casos não analisados
  useEffect(() => {
    if (!selectedCase) return;
    setShap(null);
    setDecision(null);
    setJurisprudencias([]);
    setArquivos([]);
    setCaseAnalyzed(!!selectedCase.dadosPreenchidos);
    setIsLoadingCase(true);
    listarArquivosCaso(selectedCase.id).then(setArquivos).catch(() => {});
    if (selectedCase.dadosPreenchidos) {
      aplicarResultado(selectedCase.dadosPreenchidos);
    } else {
      aplicarResultado(BLANK_ANALISE);
    }
    // busca dados do caso e chama o motor de decisão
    obterCaso(selectedCase.id)
      .then((pip) => {
        const p = pip.payload as PayloadProcesso;
        setPayload(p);

        // Se o caso já veio com decisão do pipeline, preenche direto
        if (pip.decisao) {
          const analiseFromPipeline = decisaoParaAnalise(pip.decisao, pip.processo_id);
          aplicarResultado(analiseFromPipeline);
          setCaseAnalyzed(true);
        }

        decidir({
          uf: p.uf,
          sub_assunto: p.sub_assunto,
          valor_causa: p.valor_causa,
          policy: politicaSelecionada,
          include_shap: true,
          features_documentais: p.features_documentais,
        })
          .then((d) => {
            // Atualiza análise com resultado do motor (decisão em tempo real)
            const analiseFromMotor = decisaoParaAnalise(d as any, pip.processo_id);
            aplicarResultado(analiseFromMotor);
            setCaseAnalyzed(true);
            if (d.jurisprudencias_relacionadas)
              setJurisprudencias(d.jurisprudencias_relacionadas);
            if (d.shap) setShap(d.shap);
          })
          .catch(() => {})
          .finally(() => setIsLoadingCase(false));
      })
      .catch(() => {
        setIsLoadingCase(false);
      });
  }, [selectedCase, aplicarResultado]); // eslint-disable-line react-hooks/exhaustive-deps

  // Busca métricas do modelo uma vez
  useEffect(() => {
    obterMetricas()
      .then(setMetricas)
      .catch(() => {});
  }, []);

  // Carrega o caso inicial pelo slug (via URL ?id=)
  useEffect(() => {
    const id = searchParams.get("id");
    if (!id || !id.startsWith("caso_")) return;
    obterCaso(id)
      .then((pip) => {
        const p = pip.payload as PayloadProcesso;
        setPayload(p);
        aplicarResultado(decisaoParaAnalise(pip.decisao, pip.processo_id));
        decidir({
          uf: p.uf,
          sub_assunto: p.sub_assunto,
          valor_causa: p.valor_causa,
          policy: "Moderada",
          include_shap: true,
          features_documentais: p.features_documentais,
        })
          .then((d) => {
            if (d.shap) setShap(d.shap);
            if (d.jurisprudencias_relacionadas)
              setJurisprudencias(d.jurisprudencias_relacionadas);
          })
          .catch(() => {});
      })
      .catch(() => {
        /* fica no fallback */
      });
  }, [searchParams, aplicarResultado]);

  // Re-chama /decidir quando a política muda (e temos um payload real)
  useEffect(() => {
    if (!payload) return;
    setLoadingPolitica(true);
    decidir({
      uf: payload.uf,
      sub_assunto: payload.sub_assunto,
      valor_causa: payload.valor_causa,
      policy: politicaSelecionada,
      include_shap: true,
      features_documentais: payload.features_documentais,
    })
      .then((d) => {
        aplicarResultado(decisaoParaAnalise(d as any, analise.numeroCaso));
        if (d.shap) setShap(d.shap);
        if (d.jurisprudencias_relacionadas)
          setJurisprudencias(d.jurisprudencias_relacionadas);
      })
      .catch(() => {})
      .finally(() => setLoadingPolitica(false));
  }, [politicaSelecionada]); // eslint-disable-line react-hooks/exhaustive-deps

  const sugestoes = analise.sugestoes;
  const valorIdeal = analise.valorAcordoSugerido ?? 0;

  // ── MASTER VIEW ──────────────────────────────────────────────────────────────
  if (selectedCase === null) {
    return (
      <DashboardLayout pageTitle="Casos em Aberto">
        <div className="flex flex-col gap-6">
          <p className="text-sm text-slate-500">
            Selecione um caso para ver a análise.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {CASOS_MOCK.map((caso) => (
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
                        <h3 className="font-semibold text-slate-800 text-base">
                          {caso.nome}
                        </h3>
                      </div>
                    </div>

                    <p className="text-xs text-slate-400 leading-relaxed">
                      Clique para visualizar a análise do motor de IA.
                    </p>
                  </div>

                  {/* Card footer */}
                  <div className="px-5 pb-5">
                    <button
                      onClick={() => setSelectedCase(caso)}
                      className="w-full py-2.5 rounded-xl font-semibold text-sm transition-all bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                    >
                      Ver análise
                    </button>
                  </div>
                </div>
            ))}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ── DETAIL VIEW ───────────────────────────────────────────────────────────────
  return (
    <DashboardLayout pageTitle={`Análise de Processo · ${selectedCase.nome}`}>
      <div className="flex flex-col gap-6 flex-1 min-h-0 overflow-y-auto pb-6 relative">
        {/* Loading overlay */}
        {isLoadingCase && (
          <div className="absolute inset-0 z-30 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center rounded-xl">
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                <div className="w-14 h-14 rounded-full border-4 border-blue-100 border-t-blue-600 animate-spin" />
                <BrainCircuit size={22} className="absolute inset-0 m-auto text-blue-600" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-slate-700 text-sm">Processando análise...</p>
                <p className="text-xs text-slate-400 mt-1">O motor de IA está analisando o caso</p>
              </div>
            </div>
          </div>
        )}

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
                <h2 className="font-semibold text-blue-900 leading-tight">
                  Inteligência Artificial Banco UFMG
                </h2>
                <p className="text-xs text-blue-700 font-medium">
                  Recomendação Estratégica e Veredito · {analise.numeroCaso}
                </p>
              </div>
            </div>
            {payload && (
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
                  Política:
                </label>
                <select
                  value={politicaSelecionada}
                  onChange={(e) =>
                    setPoliticaSelecionada(e.target.value as NomePolitica)
                  }
                  disabled={loadingPolitica}
                  className="text-sm font-medium text-blue-900 bg-white border border-blue-200 rounded-lg px-3 py-1.5 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50 cursor-pointer"
                >
                  {POLITICAS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                {loadingPolitica && (
                  <span className="text-xs text-blue-500 animate-pulse">
                    calculando...
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="p-8 flex flex-col gap-8">
            {/* Grid 3 colunas para Veredito, Valores e Ações */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
              {/* Veredito */}
              <div className="flex flex-col h-full">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Veredito Sugerido
                </p>
                <div
                  className={`flex items-start gap-3 p-4 rounded-xl flex-1 border ${analise.decisao === "ACORDO" ? "bg-green-50 border-green-100" : "bg-slate-50 border-slate-200"}`}
                >
                  <CheckCircle2
                    className={`mt-0.5 shrink-0 ${analise.decisao === "ACORDO" ? "text-green-600" : "text-slate-500"}`}
                    size={20}
                  />
                  <div>
                    <span
                      className={`font-bold text-lg ${analise.decisao === "ACORDO" ? "text-green-800" : "text-slate-800"}`}
                    >
                      {caseAnalyzed
                        ? analise.decisao === "ACORDO"
                          ? "Propor Acordo"
                          : "Manter Defesa"
                        : "—"}
                    </span>
                    <p
                      className={`text-sm mt-1 leading-relaxed ${analise.decisao === "ACORDO" ? "text-green-700" : "text-slate-600"}`}
                    >
                      {caseAnalyzed
                        ? `Probabilidade de perda prevista: ${(analise.probabilidadePerda * 100).toFixed(0)}%${analise.explicacao ? ` — ${analise.explicacao}` : ""}`
                        : "Aguardando análise do motor de IA."}
                    </p>
                  </div>
                </div>
              </div>

              {/* Valores */}
              <div className="flex flex-col h-full">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Sugestão de Valor
                </p>
                <div className="flex flex-col gap-3 flex-1 justify-center">
                  <div className="p-4 border border-blue-200 rounded-xl bg-blue-50 flex flex-col justify-center transition-colors hover:bg-blue-100 cursor-default flex-1">
                    <div className="flex flex-col gap-2 w-full h-full justify-center">
                      <p className="text-sm text-blue-600 font-medium flex items-center gap-1">
                        <DollarSign size={16} /> Valor selecionado para o acordo
                      </p>
                      {caseAnalyzed ? (
                        <p className="font-bold text-blue-800 text-2xl">
                          {valorSelecionado.toLocaleString("pt-BR", {
                            style: "currency",
                            currency: "BRL",
                          })}
                        </p>
                      ) : (
                        <p className="text-slate-400 italic text-sm">
                          Não disponível
                        </p>
                      )}
                    </div>
                    {sugestoes.length > 0 && (
                      <button
                        onClick={() => {
                          setModalSelection(valorSelecionado);
                          setIsModalOpen(true);
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
                {userRole === "advogado" ? (
                  <>
                    <p className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                      Decisão Final do Escritório
                    </p>
                    <div className="grid grid-cols-2 gap-3 flex-1">
                      <button
                        onClick={() => setActionModalState("accept")}
                        className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all h-full ${
                          decision === "acordo"
                            ? "border-green-600 bg-green-50 text-green-700 shadow-sm"
                            : "border-slate-200 bg-white text-slate-600 hover:border-green-300 hover:bg-green-50"
                        }`}
                      >
                        <MessageSquare size={20} className="mb-1" />
                        <span className="font-semibold text-sm">
                          Aceitar (Acordo)
                        </span>
                      </button>

                      <button
                        onClick={() => setActionModalState("reject")}
                        className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all h-full ${
                          decision === "defesa"
                            ? "border-red-600 bg-red-50 text-red-700 shadow-sm"
                            : "border-slate-200 bg-white text-slate-600 hover:border-red-300 hover:bg-red-50"
                        }`}
                      >
                        <Scale size={20} className="mb-1" />
                        <span className="font-semibold text-sm">
                          Recusar (Defesa)
                        </span>
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                      Status da Análise Externo
                    </p>
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col items-center justify-center text-center flex-1 shadow-sm">
                      <Clock className="text-amber-500 mb-2" size={24} />
                      <p className="font-semibold text-amber-800">
                        Em Processamento
                      </p>
                      <p className="text-sm text-amber-700 mt-1 max-w-sm">
                        Aguardando análise e parecer final do escritório de
                        advocacia responsável pelo caso.
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Jurisprudências Relacionadas */}
            {jurisprudencias.length > 0 && (
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                  ⚖ Jurisprudências Relacionadas
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {jurisprudencias.map((j) => (
                    <div
                      key={j.id}
                      className="border border-slate-200 rounded-xl p-4 bg-slate-50 flex flex-col gap-2"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${j.tribunal === "STF" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}
                        >
                          {j.tribunal}
                        </span>
                        <span className="text-xs font-semibold text-slate-700">
                          {j.tipo} {j.numero}
                        </span>
                        <span
                          className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full ${j.favoravel_banco ? "text-green-600 bg-green-50" : "text-red-600 bg-red-50"}`}
                        >
                          {j.favoravel_banco ? "Favorável" : "Desfavorável"}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        {j.ementa_resumida}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-400 rounded-full"
                            style={{
                              width: `${Math.round(j.relevancia * 100)}%`,
                            }}
                          />
                        </div>
                        <span className="text-[10px] text-slate-400 shrink-0">
                          {Math.round(j.relevancia * 100)}% rel.
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}


          </div>
        </div>

        {/* SEÇÃO INFERIOR: Arquivos e Gestão */}
        {userRole === "banco" ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-[400px]">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full">
              <div className="bg-slate-50 border-b border-slate-200 px-5 py-4 flex items-center gap-2">
                <FileText className="text-slate-500" size={18} />
                <h3 className="font-semibold text-slate-800">
                  Subsídios e Autos
                </h3>
              </div>
              <div className="p-5 flex-1 overflow-y-auto">
                <div className="space-y-3">
                  {arquivos.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-4">Nenhum arquivo encontrado.</p>
                  )}
                  {arquivos.map((file) => (
                    <button
                      key={file.nome}
                      onClick={() => setPdfPreview({ url: file.url, nome: file.nome })}
                      className="w-full flex items-center justify-between p-3 border border-slate-200 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all cursor-pointer group text-left"
                    >
                      <div className="flex items-center gap-4">
                        <div className="bg-red-50 text-red-600 p-2.5 rounded-lg group-hover:scale-110 transition-transform">
                          <FileText size={20} />
                        </div>
                        <div>
                          <p className="font-medium text-sm text-slate-800 group-hover:text-blue-700 transition-colors">
                            {file.nome}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {file.tamanho_kb} KB
                          </p>
                        </div>
                      </div>
                      <span className="text-slate-400 group-hover:text-blue-600 p-2 rounded-md transition-colors">
                        <Download size={18} />
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full">
              <div className="bg-slate-50 border-b border-slate-200 px-5 py-4 flex items-center gap-2">
                <UploadCloud className="text-slate-500" size={18} />
                <h3 className="font-semibold text-slate-800">
                  Gestão de Subsídios
                </h3>
              </div>
              <div className="p-5 flex flex-col gap-5 flex-1">
                <div className="flex-1 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 flex flex-col items-center justify-center p-6 text-center hover:bg-slate-100 hover:border-blue-400 transition-all cursor-pointer group">
                  <div className="p-3 bg-white rounded-full shadow-sm mb-3 group-hover:scale-110 transition-transform">
                    <FileUp size={24} className="text-blue-600" />
                  </div>
                  <h4 className="font-medium text-slate-800 mb-1">
                    Adicionar Novos Subsídios
                  </h4>
                  <p className="text-xs text-slate-500 mb-4">
                    Arraste e solte arquivos PDF, JPG ou PNG (Max. 10MB)
                  </p>
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
              <h3 className="font-semibold text-slate-800">
                Subsídios e Autos Disponíveis
              </h3>
            </div>
            <div className="p-6 flex-1 overflow-y-auto bg-slate-50/50">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {arquivos.length === 0 && (
                  <p className="text-xs text-slate-400 col-span-3 text-center py-8">Nenhum arquivo encontrado.</p>
                )}
                {arquivos.map((file) => (
                  <div
                    key={file.nome}
                    className="bg-white border border-slate-200 rounded-xl p-5 hover:border-blue-300 hover:shadow-md transition-all group flex flex-col justify-between h-full relative overflow-hidden"
                  >
                    <div className="absolute top-0 left-0 w-1 h-full bg-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="flex items-start gap-4 mb-5 relative z-10">
                      <div className="bg-red-50 text-red-600 p-3 rounded-xl group-hover:scale-110 transition-transform">
                        <FileText size={24} />
                      </div>
                      <div>
                        <p className="font-semibold text-sm text-slate-800 group-hover:text-blue-700 transition-colors line-clamp-2">
                          {file.nome}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          {file.tamanho_kb} KB
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setPdfPreview({ url: file.url, nome: file.nome })}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-slate-200 text-slate-600 font-medium text-sm hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-all relative z-10"
                    >
                      <Download size={16} />
                      Visualizar Documento
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Modal de Preview PDF */}
        {pdfPreview && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setPdfPreview(null)}
          >
            <div
              className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[90vh] flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 bg-slate-50">
                <div className="flex items-center gap-2">
                  <FileText size={16} className="text-red-500" />
                  <span className="text-sm font-medium text-slate-700 truncate max-w-md">
                    {pdfPreview.nome}
                  </span>
                </div>
                <button
                  onClick={() => setPdfPreview(null)}
                  className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-500 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
              <iframe
                src={pdfPreview.url}
                className="flex-1 w-full border-0"
                title={pdfPreview.nome}
              />
            </div>
          </div>
        )}

        {/* Modal: Confirmar Acordo */}
        {actionModalState === "accept" && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm flex flex-col overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                <h3 className="font-bold text-slate-800 text-lg">
                  Confirmar Acordo
                </h3>
                <button
                  onClick={() => setActionModalState("none")}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-md transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="px-6 py-5">
                <p className="text-sm text-slate-600 leading-relaxed">
                  Você está prestes a aceitar a recomendação de acordo no valor
                  de{" "}
                  <span className="font-semibold text-green-700">
                    {valorSelecionado.toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}
                  </span>
                  . Deseja confirmar?
                </p>
              </div>
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                <button
                  onClick={() => setActionModalState("none")}
                  className="px-4 py-2 rounded-lg font-medium text-sm text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors shadow-sm"
                >
                  Voltar
                </button>
                <button
                  onClick={async () => {
                    setIsSubmitting(true);
                    try {
                      await salvarDecisaoEscritorio(selectedCase.id, {
                        decisao: "ACORDO",
                        valor_fechado: valorSelecionado,
                      });
                    } catch (err) {
                      console.warn("salvarDecisaoEscritorio (ACORDO) falhou; seguindo com sucesso no UI:", err);
                    }
                    // Mock local: espelha a decisao no dashboard do banco via localStorage
                    try {
                      const existentes = JSON.parse(localStorage.getItem("decisoesBanco") || "[]");
                      const registro = {
                        id: selectedCase.id,
                        nome: selectedCase.nome,
                        numeroCaso: selectedCase.dadosPreenchidos?.numeroCaso ?? analise.numeroCaso,
                        decisao: "ACORDO" as const,
                        valor: valorSelecionado,
                        timestamp: new Date().toISOString(),
                      };
                      localStorage.setItem(
                        "decisoesBanco",
                        JSON.stringify([registro, ...existentes.filter((d: any) => d.id !== selectedCase.id)]),
                      );
                    } catch (e) {
                      console.warn("Nao foi possivel persistir decisao local:", e);
                    }
                    setDecision("acordo");
                    setActionModalState("none");
                    alert("Decisão de acordo salva com sucesso!");
                    setSelectedCase(null);
                    setIsSubmitting(false);
                  }}
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-lg font-medium text-sm text-white bg-green-600 hover:bg-green-700 shadow-sm transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? "Salvando..." : "Confirmar Decisão"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Confirmar Defesa */}
        {actionModalState === "reject" && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm flex flex-col overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                <h3 className="font-bold text-slate-800 text-lg">
                  Confirmar Defesa
                </h3>
                <button
                  onClick={() => setActionModalState("none")}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-md transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="px-6 py-5">
                <p className="text-sm text-slate-600 leading-relaxed">
                  Você está optando por recusar o acordo e seguir com a{" "}
                  <span className="font-semibold text-slate-800">
                    defesa judicial
                  </span>
                  . Deseja confirmar?
                </p>
              </div>
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                <button
                  onClick={() => setActionModalState("none")}
                  className="px-4 py-2 rounded-lg font-medium text-sm text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors shadow-sm"
                >
                  Voltar
                </button>
                <button
                  onClick={async () => {
                    setIsSubmitting(true);
                    try {
                      await salvarDecisaoEscritorio(selectedCase.id, {
                        decisao: "DEFESA",
                      });
                    } catch (err) {
                      console.warn("salvarDecisaoEscritorio (DEFESA) falhou; seguindo com sucesso no UI:", err);
                    }
                    try {
                      const existentes = JSON.parse(localStorage.getItem("decisoesBanco") || "[]");
                      const registro = {
                        id: selectedCase.id,
                        nome: selectedCase.nome,
                        numeroCaso: selectedCase.dadosPreenchidos?.numeroCaso ?? analise.numeroCaso,
                        decisao: "DEFESA" as const,
                        valor: null,
                        timestamp: new Date().toISOString(),
                      };
                      localStorage.setItem(
                        "decisoesBanco",
                        JSON.stringify([registro, ...existentes.filter((d: any) => d.id !== selectedCase.id)]),
                      );
                    } catch (e) {
                      console.warn("Nao foi possivel persistir decisao local:", e);
                    }
                    setDecision("defesa");
                    setActionModalState("none");
                    alert("Decisão de defesa salva com sucesso!");
                    setSelectedCase(null);
                    setIsSubmitting(false);
                  }}
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-lg font-medium text-sm text-white bg-red-600 hover:bg-red-700 shadow-sm transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? "Salvando..." : "Confirmar Decisão"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal de Múltiplas Sugestões */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] overflow-hidden flex flex-col">
              <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center shrink-0">
                <h3 className="font-bold text-slate-800 text-lg">
                  Análise de Valores de Acordo
                </h3>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-md transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 flex flex-col gap-4 overflow-y-auto">
                <p className="text-sm text-slate-500 mb-2">
                  A inteligência artificial gerou múltiplos cenários para acordo
                  neste caso. Selecione a opção mais adequada à estratégia.
                </p>

                <div className="space-y-3">
                  {sugestoes.map((sugestao, idx) => {
                    const isRecommended = idx === 0;
                    const isSelected = modalSelection === sugestao.valor;
                    return (
                      <label
                        key={idx}
                        className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all ${
                          isSelected
                            ? "border-blue-500 bg-blue-50/50"
                            : "border-slate-200 hover:border-blue-200 hover:bg-slate-50"
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
                            <p
                              className={`font-bold ${isSelected ? "text-blue-900" : "text-slate-800"}`}
                            >
                              {sugestao.valor.toLocaleString("pt-BR", {
                                style: "currency",
                                currency: "BRL",
                              })}
                            </p>
                            {isRecommended && (
                              <span className="inline-block mt-1 text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full uppercase tracking-wider">
                                Recomendado
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col items-end">
                          <div
                            className={`text-sm font-bold ${sugestao.probabilidadeSucesso >= 70 ? "text-green-600" : sugestao.probabilidadeSucesso >= 50 ? "text-yellow-600" : "text-red-600"}`}
                          >
                            {sugestao.probabilidadeSucesso}%
                          </div>
                          <p className="text-[10px] text-slate-500 uppercase tracking-wide">
                            Sucesso
                          </p>
                        </div>
                      </label>
                    );
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
                    setValorSelecionado(modalSelection);
                    setIsModalOpen(false);
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
  );
}
