import { useState } from 'react'
import { FileText, BrainCircuit, CheckCircle2, DollarSign, Scale, MessageSquare, UploadCloud, Info, AlertCircle, Clock, FileUp, Check, Download, X } from 'lucide-react'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { useView } from '@/context/ViewContext'
import { mockProcessos } from '@/data/mockData'

export default function ProcessAnalysisPage() {
  const [decision, setDecision] = useState<'acordo' | 'defesa' | null>(null)
  const { userRole } = useView()

  const processoMock = mockProcessos[0]!
  const sugestoes = processoMock.sugestoesValor || []
  const valorIdeal = sugestoes.length > 0 ? sugestoes[0].valor : 85000

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [valorSelecionado, setValorSelecionado] = useState<number>(valorIdeal)
  const [modalSelection, setModalSelection] = useState<number>(valorIdeal)

  return (
    <DashboardLayout pageTitle="Análise de Processo · Autos nº 0012345-67.2024">
      <div className="flex flex-col gap-6 flex-1 min-h-0 overflow-y-auto pb-6">
        
        {/* SEÇÃO SUPERIOR: Recomendação da IA (Largura Total) */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col shrink-0">
          <div className="bg-blue-50 border-b border-blue-100 px-5 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-600 rounded-lg text-white shadow-sm">
                <BrainCircuit size={20} />
              </div>
              <div>
                <h2 className="font-semibold text-blue-900 leading-tight">Inteligência Artificial Banco UFMG</h2>
                <p className="text-xs text-blue-700 font-medium">Recomendação Estratégica e Veredito</p>
              </div>
            </div>
          </div>

          <div className="p-8 flex flex-col gap-8">
            {/* Resumo do Caso */}
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Resumo do Caso</p>
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-sm text-slate-700 leading-relaxed shadow-sm">
                A parte autora alega não reconhecer a contratação do empréstimo consignado, contestando os descontos realizados em sua conta bancária. Requer indenização por danos materiais e morais.
              </div>
            </div>

            {/* Grid 3 colunas para Veredito, Valores e Ações */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
              {/* Veredito */}
              <div className="flex flex-col h-full">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Veredito Sugerido</p>
                <div className="flex items-start gap-3 bg-green-50 border border-green-100 p-4 rounded-xl flex-1">
                  <CheckCircle2 className="text-green-600 mt-0.5 shrink-0" size={20} />
                  <div>
                    <span className="font-bold text-green-800 text-lg">Propor Acordo</span>
                    <p className="text-sm text-green-700 mt-1 leading-relaxed">
                      Alta probabilidade de perda em 1ª instância (78%) devido a jurisprudência desfavorável.
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
                      <p className="font-bold text-blue-800 text-2xl">{valorSelecionado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
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
          </div>
        </div>

        {/* SEÇÃO INFERIOR: Arquivos e Gestão */}
        {userRole === 'banco' ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-[400px]">
            {/* COLUNA ESQUERDA: Lista de Arquivos (Banco) */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full">
              <div className="bg-slate-50 border-b border-slate-200 px-5 py-4 flex items-center gap-2">
                <FileText className="text-slate-500" size={18} />
                <h3 className="font-semibold text-slate-800">Subsídios e Autos</h3>
              </div>
              <div className="p-5 flex-1 overflow-y-auto">
                <div className="space-y-3">
                  {/* File Item */}
                  <div className="flex items-center justify-between p-3 border border-slate-200 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all cursor-pointer group">
                    <div className="flex items-center gap-4">
                      <div className="bg-red-50 text-red-600 p-2.5 rounded-lg group-hover:scale-110 transition-transform">
                        <FileText size={20} />
                      </div>
                      <div>
                        <p className="font-medium text-sm text-slate-800 group-hover:text-blue-700 transition-colors">Contrato_Financiamento_Assinado.pdf</p>
                        <p className="text-xs text-slate-500 mt-0.5">Banco UFMG • 1.2 MB</p>
                      </div>
                    </div>
                    <button className="text-slate-400 group-hover:text-blue-600 p-2 rounded-md transition-colors" title="Baixar documento">
                      <Download size={18} />
                    </button>
                  </div>
                  
                  {/* File Item */}
                  <div className="flex items-center justify-between p-3 border border-slate-200 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all cursor-pointer group">
                    <div className="flex items-center gap-4">
                      <div className="bg-red-50 text-red-600 p-2.5 rounded-lg group-hover:scale-110 transition-transform">
                        <FileText size={20} />
                      </div>
                      <div>
                        <p className="font-medium text-sm text-slate-800 group-hover:text-blue-700 transition-colors">Extrato_Movimentacao_2023.pdf</p>
                        <p className="text-xs text-slate-500 mt-0.5">Banco UFMG • 850 KB</p>
                      </div>
                    </div>
                    <button className="text-slate-400 group-hover:text-blue-600 p-2 rounded-md transition-colors" title="Baixar documento">
                      <Download size={18} />
                    </button>
                  </div>

                  {/* File Item */}
                  <div className="flex items-center justify-between p-3 border border-slate-200 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all cursor-pointer group">
                    <div className="flex items-center gap-4">
                      <div className="bg-red-50 text-red-600 p-2.5 rounded-lg group-hover:scale-110 transition-transform">
                        <FileText size={20} />
                      </div>
                      <div>
                        <p className="font-medium text-sm text-slate-800 group-hover:text-blue-700 transition-colors">Peticao_Inicial_Autos.pdf</p>
                        <p className="text-xs text-slate-500 mt-0.5">Documento do Tribunal • 2.1 MB</p>
                      </div>
                    </div>
                    <button className="text-slate-400 group-hover:text-blue-600 p-2 rounded-md transition-colors" title="Baixar documento">
                      <Download size={18} />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* COLUNA DIREITA: Ação por Perfil (Banco) */}
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
            {/* VISÃO ADVOGADO: Coluna Única com Grid de Cards */}
            <div className="bg-slate-50 border-b border-slate-200 px-5 py-4 flex items-center gap-2">
              <FileText className="text-slate-500" size={18} />
              <h3 className="font-semibold text-slate-800">Subsídios e Autos Disponíveis</h3>
            </div>
            <div className="p-6 flex-1 overflow-y-auto bg-slate-50/50">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                
                {/* File Card 1 */}
                <div className="bg-white border border-slate-200 rounded-xl p-5 hover:border-blue-300 hover:shadow-md transition-all group flex flex-col justify-between h-full relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-blue-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  <div className="flex items-start gap-4 mb-5 relative z-10">
                    <div className="bg-red-50 text-red-600 p-3 rounded-xl group-hover:scale-110 transition-transform">
                      <FileText size={24} />
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-slate-800 group-hover:text-blue-700 transition-colors line-clamp-2">Contrato_Financiamento_Assinado.pdf</p>
                      <p className="text-xs text-slate-500 mt-1">Banco UFMG • 1.2 MB</p>
                    </div>
                  </div>
                  <button className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-slate-200 text-slate-600 font-medium text-sm hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-all relative z-10">
                    <Download size={16} />
                    Visualizar Documento
                  </button>
                </div>

                {/* File Card 2 */}
                <div className="bg-white border border-slate-200 rounded-xl p-5 hover:border-blue-300 hover:shadow-md transition-all group flex flex-col justify-between h-full relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-blue-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  <div className="flex items-start gap-4 mb-5 relative z-10">
                    <div className="bg-red-50 text-red-600 p-3 rounded-xl group-hover:scale-110 transition-transform">
                      <FileText size={24} />
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-slate-800 group-hover:text-blue-700 transition-colors line-clamp-2">Extrato_Movimentacao_2023.pdf</p>
                      <p className="text-xs text-slate-500 mt-1">Banco UFMG • 850 KB</p>
                    </div>
                  </div>
                  <button className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-slate-200 text-slate-600 font-medium text-sm hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-all relative z-10">
                    <Download size={16} />
                    Visualizar Documento
                  </button>
                </div>

                {/* File Card 3 */}
                <div className="bg-white border border-slate-200 rounded-xl p-5 hover:border-blue-300 hover:shadow-md transition-all group flex flex-col justify-between h-full relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-blue-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  <div className="flex items-start gap-4 mb-5 relative z-10">
                    <div className="bg-red-50 text-red-600 p-3 rounded-xl group-hover:scale-110 transition-transform">
                      <FileText size={24} />
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-slate-800 group-hover:text-blue-700 transition-colors line-clamp-2">Peticao_Inicial_Autos.pdf</p>
                      <p className="text-xs text-slate-500 mt-1">Documento do Tribunal • 2.1 MB</p>
                    </div>
                  </div>
                  <button className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-slate-200 text-slate-600 font-medium text-sm hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-all relative z-10">
                    <Download size={16} />
                    Visualizar Documento
                  </button>
                </div>

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
                    const isRecommended = idx === 0;
                    const isSelected = modalSelection === sugestao.valor;
                    
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
