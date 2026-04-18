--
-- PostgreSQL database dump
--

\restrict ZDX5pM6fJmvafvasP5Z7H1MaNjBjGby8PhnCYkOGoNaa8kR5eGdeaaD7crwTfbS

-- Dumped from database version 16.13
-- Dumped by pg_dump version 16.13

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: decisoes_processo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.decisoes_processo (
    processo_id character varying(60) NOT NULL,
    uf character(2) NOT NULL,
    sub_assunto character varying(60) NOT NULL,
    valor_causa numeric(12,2) NOT NULL,
    ifp_score smallint NOT NULL,
    ifp_score_normalizado numeric(4,3) NOT NULL,
    ifp_tier character varying(20) NOT NULL,
    ifp_presenca smallint NOT NULL,
    ifp_qualidade smallint NOT NULL,
    ifp_sinais_fortes jsonb NOT NULL,
    ifp_sinais_ausentes jsonb NOT NULL,
    ifp_reasoning text NOT NULL,
    tem_contrato boolean NOT NULL,
    tem_extrato boolean NOT NULL,
    tem_comprovante boolean NOT NULL,
    tem_dossie boolean NOT NULL,
    tem_demonstrativo boolean NOT NULL,
    tem_laudo boolean NOT NULL,
    laudo_favoravel boolean NOT NULL,
    score_fraude numeric(4,3) NOT NULL,
    indicio_de_fraude boolean NOT NULL,
    indicadores_fraude jsonb NOT NULL,
    sinais_protetivos jsonb NOT NULL,
    justificativa_fraude text NOT NULL,
    politicas jsonb NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Data for Name: decisoes_processo; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.decisoes_processo (processo_id, uf, sub_assunto, valor_causa, ifp_score, ifp_score_normalizado, ifp_tier, ifp_presenca, ifp_qualidade, ifp_sinais_fortes, ifp_sinais_ausentes, ifp_reasoning, tem_contrato, tem_extrato, tem_comprovante, tem_dossie, tem_demonstrativo, tem_laudo, laudo_favoravel, score_fraude, indicio_de_fraude, indicadores_fraude, sinais_protetivos, justificativa_fraude, politicas, criado_em) FROM stdin;
Caso_01	MA	Genérico	20000.00	100	1.000	FORTE	60	40	["extrato_autor_movimentou_dinheiro", "demonstrativo_21_parcelas_pagas", "dossie_assinatura_confere", "laudo_evidencia_digital(gravacao_voz)"]	[]	IFP v2 = 100 (FORTE). Todos os 6 subsídios presentes; qualidade 40/40.	t	t	t	t	t	t	t	0.200	f	[]	["extrato_autor_movimentou_dinheiro", "demonstrativo_21_parcelas_pagas", "dossie_assinatura_confere", "laudo_evidencia_digital(gravacao_voz)"]	O cenário apresenta diversos sinais de legitimidade, como a movimentação do dinheiro e o pagamento de parcelas. A assinatura confere e há evidências digitais, o que indica um baixo risco de fraude.	{"Moderada": {"alpha": 1.0, "limiar": 4000.0, "policy": "Moderada", "decisao": "DEFESA", "explicacao": "Decisao: DEFESA. Probabilidade de perda prevista: 5.2%. Condenacao estimada (se perder): R$ 7,871.48 (faixa IC 80%: R$ 5,775.49 a R$ 13,063.98). Custo esperado da defesa: R$ 1,821.72. A decisao foi sobreposta pela forca probatoria dos subsidios (IFP = 1.00): documentacao agregada acima do limiar de 0.75. Recomenda-se DEFESA independente do modelo ML. Politica aplicada: Moderada.", "alpha_quantil": 0.5, "razao_override": "IFP_FORTE", "override_aplicado": true, "alphas_por_quantil": {"0.3": 1.0, "0.5": 1.0, "0.9": 1.0, "0.15": 0.867, "0.75": 1.0}, "custo_processual_cp": 1408.72, "probabilidade_perda": 0.0525, "taxa_aceite_estimada": 0.5, "custo_esperado_defesa": 1821.72, "valor_acordo_sugerido": null, "valor_condenacao_estimado": 7871.48, "economia_esperada_vs_defesa": null, "valor_condenacao_faixa_ic80": {"q10": 5775.49, "q90": 13063.98}}, "Arriscada": {"alpha": 1.0, "limiar": 2000.0, "policy": "Arriscada", "decisao": "DEFESA", "explicacao": "Decisao: DEFESA. Probabilidade de perda prevista: 5.2%. Condenacao estimada (se perder): R$ 7,871.48 (faixa IC 80%: R$ 5,775.49 a R$ 13,063.98). Custo esperado da defesa: R$ 1,821.72. A decisao foi sobreposta pela forca probatoria dos subsidios (IFP = 1.00): documentacao agregada acima do limiar de 0.75. Recomenda-se DEFESA independente do modelo ML. Politica aplicada: Arriscada.", "alpha_quantil": 0.3, "razao_override": "IFP_FORTE", "override_aplicado": true, "alphas_por_quantil": {"0.3": 1.0, "0.5": 1.0, "0.9": 1.0, "0.15": 0.867, "0.75": 1.0}, "custo_processual_cp": 1408.72, "probabilidade_perda": 0.0525, "taxa_aceite_estimada": 0.3, "custo_esperado_defesa": 1821.72, "valor_acordo_sugerido": null, "valor_condenacao_estimado": 7871.48, "economia_esperada_vs_defesa": null, "valor_condenacao_faixa_ic80": {"q10": 5775.49, "q90": 13063.98}}, "Conservadora": {"alpha": 1.0, "limiar": 7000.0, "policy": "Conservadora", "decisao": "DEFESA", "explicacao": "Decisao: DEFESA. Probabilidade de perda prevista: 5.2%. Condenacao estimada (se perder): R$ 7,871.48 (faixa IC 80%: R$ 5,775.49 a R$ 13,063.98). Custo esperado da defesa: R$ 1,821.72. A decisao foi sobreposta pela forca probatoria dos subsidios (IFP = 1.00): documentacao agregada acima do limiar de 0.75. Recomenda-se DEFESA independente do modelo ML. Politica aplicada: Conservadora.", "alpha_quantil": 0.75, "razao_override": "IFP_FORTE", "override_aplicado": true, "alphas_por_quantil": {"0.3": 1.0, "0.5": 1.0, "0.9": 1.0, "0.15": 0.867, "0.75": 1.0}, "custo_processual_cp": 1408.72, "probabilidade_perda": 0.0525, "taxa_aceite_estimada": 0.75, "custo_esperado_defesa": 1821.72, "valor_acordo_sugerido": null, "valor_condenacao_estimado": 7871.48, "economia_esperada_vs_defesa": null, "valor_condenacao_faixa_ic80": {"q10": 5775.49, "q90": 13063.98}}}	2026-04-18 03:54:29.923085+00
Caso_02	AM	Golpe	25000.00	42	0.420	FRACO	25	17	["demonstrativo_8_parcelas_pagas", "laudo_evidencia_digital(biometria|device_fingerprint|geolocalizacao)"]	["contrato", "extrato", "dossie"]	IFP v2 = 42 (FRACO). Presença 25/60 (falta: contrato, extrato, dossie), qualidade 17/40.	f	f	t	f	t	t	t	0.300	f	["Falta de contrato", "Falta de extrato", "Canal digital com biometria mas sem dossiê"]	["8 parcelas pagas", "Laudo com biometria, device fingerprint e geolocalização"]	O score de fraude é 0.300 devido à ausência de contrato e extrato, que são documentos essenciais para validar a operação. Apesar de haver 8 parcelas pagas e evidências digitais, a falta de documentação completa gera um cenário de sinais conflitantes.	{"Moderada": {"alpha": 0.558, "limiar": 4000.0, "policy": "Moderada", "decisao": "ACORDO", "explicacao": "Decisao: ACORDO. Probabilidade de perda prevista: 93.0%. Condenacao estimada (se perder): R$ 20,601.06 (faixa IC 80%: R$ 19,933.15 a R$ 24,121.60). Custo esperado da defesa: R$ 20,558.37. Valor sugerido de acordo: R$ 11,469.94 (alpha = 0.56 x custo esperado; taxa historica de aceite estimada: 50%). Custo esperado (R$ 20,558.37) supera o limiar de R$ 4,000.00. Politica aplicada: Moderada.", "alpha_quantil": 0.5, "razao_override": null, "override_aplicado": false, "alphas_por_quantil": {"0.3": 0.471, "0.5": 0.558, "0.9": 1.0, "0.15": 0.444, "0.75": 0.558}, "custo_processual_cp": 1408.72, "probabilidade_perda": 0.9295, "taxa_aceite_estimada": 0.5, "custo_esperado_defesa": 20558.37, "valor_acordo_sugerido": 11469.94, "valor_condenacao_estimado": 20601.06, "economia_esperada_vs_defesa": 4544.21, "valor_condenacao_faixa_ic80": {"q10": 19933.15, "q90": 24121.6}}, "Arriscada": {"alpha": 0.471, "limiar": 2000.0, "policy": "Arriscada", "decisao": "ACORDO", "explicacao": "Decisao: ACORDO. Probabilidade de perda prevista: 93.0%. Condenacao estimada (se perder): R$ 20,601.06 (faixa IC 80%: R$ 19,933.15 a R$ 24,121.60). Custo esperado da defesa: R$ 20,558.37. Valor sugerido de acordo: R$ 9,692.70 (alpha = 0.47 x custo esperado; taxa historica de aceite estimada: 30%). Custo esperado (R$ 20,558.37) supera o limiar de R$ 2,000.00. Politica aplicada: Arriscada.", "alpha_quantil": 0.3, "razao_override": null, "override_aplicado": false, "alphas_por_quantil": {"0.3": 0.471, "0.5": 0.558, "0.9": 1.0, "0.15": 0.444, "0.75": 0.558}, "custo_processual_cp": 1408.72, "probabilidade_perda": 0.9295, "taxa_aceite_estimada": 0.3, "custo_esperado_defesa": 20558.37, "valor_acordo_sugerido": 9692.7, "valor_condenacao_estimado": 20601.06, "economia_esperada_vs_defesa": 3259.7, "valor_condenacao_faixa_ic80": {"q10": 19933.15, "q90": 24121.6}}, "Conservadora": {"alpha": 0.558, "limiar": 7000.0, "policy": "Conservadora", "decisao": "ACORDO", "explicacao": "Decisao: ACORDO. Probabilidade de perda prevista: 93.0%. Condenacao estimada (se perder): R$ 20,601.06 (faixa IC 80%: R$ 19,933.15 a R$ 24,121.60). Custo esperado da defesa: R$ 20,558.37. Valor sugerido de acordo: R$ 11,469.94 (alpha = 0.56 x custo esperado; taxa historica de aceite estimada: 75%). Custo esperado (R$ 20,558.37) supera o limiar de R$ 7,000.00. Politica aplicada: Conservadora.", "alpha_quantil": 0.75, "razao_override": null, "override_aplicado": false, "alphas_por_quantil": {"0.3": 0.471, "0.5": 0.558, "0.9": 1.0, "0.15": 0.444, "0.75": 0.558}, "custo_processual_cp": 1408.72, "probabilidade_perda": 0.9295, "taxa_aceite_estimada": 0.75, "custo_esperado_defesa": 20558.37, "valor_acordo_sugerido": 11469.94, "valor_condenacao_estimado": 20601.06, "economia_esperada_vs_defesa": 6816.32, "valor_condenacao_faixa_ic80": {"q10": 19933.15, "q90": 24121.6}}}	2026-04-18 03:54:29.923085+00
\.


--
-- Name: decisoes_processo decisoes_processo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.decisoes_processo
    ADD CONSTRAINT decisoes_processo_pkey PRIMARY KEY (processo_id);


--
-- Name: idx_decisoes_ifp_tier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_decisoes_ifp_tier ON public.decisoes_processo USING btree (ifp_tier);


--
-- Name: idx_decisoes_indicio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_decisoes_indicio ON public.decisoes_processo USING btree (indicio_de_fraude);


--
-- Name: idx_decisoes_politicas; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_decisoes_politicas ON public.decisoes_processo USING gin (politicas);


--
-- Name: idx_decisoes_uf; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_decisoes_uf ON public.decisoes_processo USING btree (uf);


--
-- PostgreSQL database dump complete
--

\unrestrict ZDX5pM6fJmvafvasP5Z7H1MaNjBjGby8PhnCYkOGoNaa8kR5eGdeaaD7crwTfbS

