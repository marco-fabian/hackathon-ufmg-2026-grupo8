"""RAG de jurisprudencia: dado o contexto de uma decisao, retorna as
sumulas/teses do STJ mais relevantes do corpus curado.

Estrategia de embedding:
  - Com OPENAI_API_KEY: text-embedding-3-small (batch unico no startup).
  - Sem key: TfidfVectorizer do sklearn (fallback robusto, sem API).

Singleton via get_rag() — mesma convencao de get_motor() em api.py.
"""
from __future__ import annotations

import functools
import json
import os
from pathlib import Path
from typing import Optional

import numpy as np

CORPUS_PATH = Path(__file__).resolve().parents[1] / "data" / "jurisprudencia.json"


def _cosine(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b, axis=1)
    if norm_a == 0 or np.any(norm_b == 0):
        return np.zeros(len(b))
    return (b @ a) / (norm_b * norm_a)


class JurisprudenciaRAG:
    def __init__(self, corpus_path: Path = CORPUS_PATH, openai_api_key: Optional[str] = None):
        self._corpus: list[dict] = json.loads(corpus_path.read_text(encoding="utf-8"))
        self._api_key = openai_api_key or os.getenv("OPENAI_API_KEY", "")
        self._embeddings: Optional[np.ndarray] = None
        self._tfidf = None
        self._tfidf_matrix = None
        self._inicializado = False

    def _textos_corpus(self) -> list[str]:
        return [
            f"{item['ementa']} {' '.join(item.get('contextos', []))}"
            for item in self._corpus
        ]

    def _inicializar_openai(self) -> bool:
        try:
            from openai import OpenAI
            client = OpenAI(api_key=self._api_key, timeout=15.0)
            textos = self._textos_corpus()
            resp = client.embeddings.create(model="text-embedding-3-small", input=textos)
            self._embeddings = np.array([e.embedding for e in resp.data], dtype=np.float32)
            return True
        except Exception as exc:
            print(f"[rag] OpenAI embedding falhou ({type(exc).__name__}), usando TF-IDF.")
            return False

    def _inicializar_tfidf(self) -> None:
        from sklearn.feature_extraction.text import TfidfVectorizer
        textos = self._textos_corpus()
        self._tfidf = TfidfVectorizer(ngram_range=(1, 2), min_df=1)
        self._tfidf_matrix = self._tfidf.fit_transform(textos).toarray().astype(np.float32)

    def _garantir_inicializado(self) -> None:
        if self._inicializado:
            return
        if self._api_key:
            ok = self._inicializar_openai()
        else:
            ok = False
        if not ok:
            self._inicializar_tfidf()
        self._inicializado = True

    def _embed_query_openai(self, texto: str) -> np.ndarray:
        from openai import OpenAI
        client = OpenAI(api_key=self._api_key, timeout=5.0)
        resp = client.embeddings.create(model="text-embedding-3-small", input=[texto])
        return np.array(resp.data[0].embedding, dtype=np.float32)

    def _embed_query_tfidf(self, texto: str) -> np.ndarray:
        return self._tfidf.transform([texto]).toarray()[0].astype(np.float32)

    def buscar(
        self,
        sub_assunto: str,
        razao_override: str,
        decisao: str,
        top_k: int = 3,
    ) -> list[dict]:
        """Retorna top_k jurisprudencias mais relevantes para o contexto da decisao."""
        self._garantir_inicializado()

        query = (
            f"{sub_assunto} {razao_override} empréstimo não reconhecido "
            f"contrato bancário {decisao} fraude operação bancária"
        )

        try:
            if self._embeddings is not None:
                q_vec = self._embed_query_openai(query)
                scores = _cosine(q_vec, self._embeddings)
            else:
                q_vec = self._embed_query_tfidf(query)
                scores = _cosine(q_vec, self._tfidf_matrix)
        except Exception as exc:
            print(f"[rag] busca falhou ({type(exc).__name__}), retornando vazio.")
            return []

        top_idx = np.argsort(scores)[::-1][:top_k]
        resultado = []
        for i in top_idx:
            item = self._corpus[i]
            resultado.append({
                "id": item["id"],
                "tribunal": item["tribunal"],
                "tipo": item["tipo"],
                "numero": item["numero"],
                "ementa_resumida": item["ementa_resumida"],
                "favoravel_banco": item["favoravel_banco"],
                "relevancia": round(float(scores[i]), 3),
            })
        return resultado


@functools.lru_cache(maxsize=None)
def get_rag() -> JurisprudenciaRAG:
    return JurisprudenciaRAG()
