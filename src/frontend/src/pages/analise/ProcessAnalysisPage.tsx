import { useState } from 'react'
import { FileText, BrainCircuit, CheckCircle2, DollarSign, Scale, MessageSquare } from 'lucide-react'
import { DashboardLayout } from '@/components/layout/DashboardLayout'

export default function ProcessAnalysisPage() {
  const [decision, setDecision] = useState<'acordo' | 'defesa' | null>(null)

  return (
    <DashboardLayout pageTitle="Análise de Processo · IA Recomendação">
      <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
        {/* Coluna Esquerda: Visualizador de PDF (2/3) */}
        <div className="lg:w-2/3 flex flex-col gap-4">
          <div 
            className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden"
          >
            {/* Header do Visualizador */}
            <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="text-slate-500" size={18} />
                <span className="font-semibold text-sm text-slate-800">Autos do Processo nº 0012345-67.2024</span>
              </div>
              <div className="flex gap-2">
                <button className="px-3 py-1 bg-white border border-slate-200 rounded text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                  Autos (Petição Inicial)
                </button>
                <button className="px-3 py-1 bg-white border border-slate-200 rounded text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                  Subsídios
                </button>
              </div>
            </div>
            
            {/* Placeholder do PDF */}
            <div className="flex-1 bg-slate-100 flex items-center justify-center">
              <div className="text-center text-slate-400">
                <FileText size={48} className="mx-auto mb-3 opacity-50" />
                <p className="font-medium">Visualizador de Documentos</p>
                <p className="text-xs mt-1">Carregando visualização do PDF dos autos e subsídios...</p>
              </div>
            </div>
          </div>
        </div>

        {/* Coluna Direita: Painel IA (1/3) */}
        <div className="lg:w-1/3 flex flex-col gap-4">
          {/* Card de Recomendação IA */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col flex-1">
            <div className="bg-blue-50 border-b border-blue-100 px-5 py-4 flex items-center gap-3">
              <div className="p-2 bg-blue-600 rounded-lg text-white">
                <BrainCircuit size={20} />
              </div>
              <div>
                <h2 className="font-semibold text-blue-900 leading-tight">Inteligência Artificial</h2>
                <p className="text-xs text-blue-700 font-medium">Recomendação Estratégica</p>
              </div>
            </div>

            <div className="p-5 flex-1 flex flex-col gap-6 overflow-y-auto">
              {/* Veredito */}
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Veredito Sugerido</p>
                <div className="flex items-start gap-3 bg-green-50 border border-green-100 p-4 rounded-lg">
                  <CheckCircle2 className="text-green-600 mt-0.5 shrink-0" size={20} />
                  <div>
                    <span className="font-bold text-green-800 text-lg">Propor Acordo</span>
                    <p className="text-sm text-green-700 mt-1">
                      Alta probabilidade de perda em 1ª instância (78%) devido a jurisprudência recente desfavorável.
                    </p>
                  </div>
                </div>
              </div>

              {/* Sugestão de Valores */}
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Valores Estimados</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 border border-slate-200 rounded-lg bg-slate-50">
                    <p className="text-xs text-slate-500 mb-1">Risco de Condenação</p>
                    <p className="font-bold text-slate-800">R$ 150.000,00</p>
                  </div>
                  <div className="p-3 border border-blue-200 rounded-lg bg-blue-50">
                    <p className="text-xs text-blue-600 font-medium mb-1 flex items-center gap-1">
                      <DollarSign size={12}/> Teto Ideal (Acordo)
                    </p>
                    <p className="font-bold text-blue-800">R$ 85.000,00</p>
                  </div>
                </div>
              </div>

              {/* Justificativa */}
              <div>
                 <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Fundamentação Principal</p>
                 <ul className="space-y-2 text-sm text-slate-600">
                   <li className="flex gap-2">
                     <span className="text-blue-500 font-bold shrink-0">•</span>
                     <span>Ausência de comprovante de entrega de mercadoria nos autos.</span>
                   </li>
                   <li className="flex gap-2">
                     <span className="text-blue-500 font-bold shrink-0">•</span>
                     <span>Súmula vinculante aplicável ao caso para este réu.</span>
                   </li>
                 </ul>
              </div>

              <div className="mt-auto pt-4 border-t border-slate-100">
                <p className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3 text-center">Decisão do Advogado</p>
                
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => setDecision('acordo')}
                    className={`flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all ${
                      decision === 'acordo' 
                        ? 'border-green-600 bg-green-50 text-green-700' 
                        : 'border-slate-200 bg-white text-slate-600 hover:border-green-300 hover:bg-green-50'
                    }`}
                  >
                    <MessageSquare size={20} className="mb-1" />
                    <span className="font-semibold text-sm">Seguir Acordo</span>
                  </button>
                  
                  <button 
                    onClick={() => setDecision('defesa')}
                    className={`flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all ${
                      decision === 'defesa' 
                        ? 'border-red-600 bg-red-50 text-red-700' 
                        : 'border-slate-200 bg-white text-slate-600 hover:border-red-300 hover:bg-red-50'
                    }`}
                  >
                    <Scale size={20} className="mb-1" />
                    <span className="font-semibold text-sm">Apresentar Defesa</span>
                  </button>
                </div>
                
                {decision && (
                   <button className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg transition-colors shadow-sm">
                     Confirmar e Continuar
                   </button>
                )}
              </div>

            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
