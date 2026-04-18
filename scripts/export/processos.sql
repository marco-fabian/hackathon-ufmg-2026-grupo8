-- Tabela processos: 60k processos da base Hackaton_Enter_Base_Candidatos.xlsx
-- Uso: psql -U <user> -d <db> -f processos.sql

CREATE TABLE IF NOT EXISTS processos (
    numero_processo   VARCHAR(30)    PRIMARY KEY,
    uf                CHAR(2)        NOT NULL,
    assunto           VARCHAR(120)   NOT NULL,
    sub_assunto       VARCHAR(60)    NOT NULL,
    valor_causa       NUMERIC(12,2)  NOT NULL,
    valor_condenacao  NUMERIC(12,2)  NOT NULL,
    resultado_macro   VARCHAR(20)    NOT NULL,
    resultado_micro   VARCHAR(40)    NOT NULL,
    tem_contrato      BOOLEAN        NOT NULL,
    tem_extrato       BOOLEAN        NOT NULL,
    tem_comprovante   BOOLEAN        NOT NULL,
    tem_dossie        BOOLEAN        NOT NULL,
    tem_demonstrativo BOOLEAN        NOT NULL,
    tem_laudo         BOOLEAN        NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_processos_uf              ON processos(uf);
CREATE INDEX IF NOT EXISTS idx_processos_sub_assunto     ON processos(sub_assunto);
CREATE INDEX IF NOT EXISTS idx_processos_resultado_macro ON processos(resultado_macro);
