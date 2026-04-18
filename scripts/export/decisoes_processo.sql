-- Tabela decisoes_processo: output do pipeline de decisao (scripts/output/*.json)
-- Uma linha por run; politicas e arrays como JSONB.
-- Uso: psql -U <user> -d <db> -f decisoes_processo.sql

CREATE TABLE IF NOT EXISTS decisoes_processo (
    processo_id            VARCHAR(60)    PRIMARY KEY,
    uf                     CHAR(2)        NOT NULL,
    sub_assunto            VARCHAR(60)    NOT NULL,
    valor_causa            NUMERIC(12,2)  NOT NULL,

    ifp_score              SMALLINT       NOT NULL,
    ifp_score_normalizado  NUMERIC(4,3)   NOT NULL,
    ifp_tier               VARCHAR(20)    NOT NULL,
    ifp_presenca           SMALLINT       NOT NULL,
    ifp_qualidade          SMALLINT       NOT NULL,
    ifp_sinais_fortes      JSONB          NOT NULL,
    ifp_sinais_ausentes    JSONB          NOT NULL,
    ifp_reasoning          TEXT           NOT NULL,

    tem_contrato           BOOLEAN        NOT NULL,
    tem_extrato            BOOLEAN        NOT NULL,
    tem_comprovante        BOOLEAN        NOT NULL,
    tem_dossie             BOOLEAN        NOT NULL,
    tem_demonstrativo      BOOLEAN        NOT NULL,
    tem_laudo              BOOLEAN        NOT NULL,
    laudo_favoravel        BOOLEAN        NOT NULL,

    score_fraude           NUMERIC(4,3)   NOT NULL,
    indicio_de_fraude      BOOLEAN        NOT NULL,
    indicadores_fraude     JSONB          NOT NULL,
    sinais_protetivos      JSONB          NOT NULL,
    justificativa_fraude   TEXT           NOT NULL,

    politicas              JSONB          NOT NULL,

    criado_em              TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_decisoes_uf        ON decisoes_processo(uf);
CREATE INDEX IF NOT EXISTS idx_decisoes_ifp_tier  ON decisoes_processo(ifp_tier);
CREATE INDEX IF NOT EXISTS idx_decisoes_indicio   ON decisoes_processo(indicio_de_fraude);
CREATE INDEX IF NOT EXISTS idx_decisoes_politicas ON decisoes_processo USING GIN (politicas);
