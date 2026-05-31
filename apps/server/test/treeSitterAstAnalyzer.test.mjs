import assert from "node:assert/strict";
import test from "node:test";
import { TreeSitterAstAnalyzer } from "../dist/infrastructure/ast/TreeSitterAstAnalyzer.js";

test("TreeSitterAstAnalyzer parses TSX and extracts structural symbols", async () => {
  const analyzer = new TreeSitterAstAnalyzer(undefined, () => new Date("2026-05-28T20:00:00.000Z"));
  const result = await analyzer.analyze({
    candidates: [
      candidate({
        path: "src/App.tsx",
        language: "typescript",
        content: `
          import React, { useState } from "react";
          export interface AppProps { title: string }
          export function useCounter() { return useState(0); }
          export const App = () => {
            const [count] = useCounter();
            return <main>{count}</main>;
          };
          export class Dashboard extends React.Component {
            render() { return <section />; }
          }
        `,
      }),
    ],
  });

  assert.equal(result.status, "complete");
  assert.equal(result.summary.parsedDocumentCount, 1);
  assert.equal(result.summary.hasBlockingDiagnostics, false);
  const symbols = result.documents[0].symbols;
  assert.ok(symbols.some((symbol) => symbol.kind === "import" && symbol.name === "react"));
  assert.ok(symbols.some((symbol) => symbol.kind === "interface" && symbol.name === "AppProps"));
  assert.ok(symbols.some((symbol) => symbol.kind === "hook" && symbol.name === "useCounter"));
  assert.ok(symbols.some((symbol) => symbol.kind === "component" && symbol.name === "App"));
  assert.ok(symbols.some((symbol) => symbol.kind === "component" && symbol.name === "Dashboard"));
  assert.ok(symbols.some((symbol) => symbol.kind === "export" && symbol.name === "App"));
});

test("TreeSitterAstAnalyzer parses JavaScript server functions", async () => {
  const analyzer = new TreeSitterAstAnalyzer(undefined, () => new Date("2026-05-28T20:00:00.000Z"));
  const result = await analyzer.analyze({
    candidates: [
      candidate({
        path: "server/routes.js",
        language: "javascript",
        content: `
          import express from "express";
          export function healthRoute(_req, res) {
            return res.json({ ok: true });
          }
        `,
      }),
    ],
  });

  assert.equal(result.status, "complete");
  assert.ok(
    result.documents[0].symbols.some(
      (symbol) => symbol.kind === "function" && symbol.name === "healthRoute"
    )
  );
});

test("TreeSitterAstAnalyzer returns blocking diagnostics for syntax errors", async () => {
  const analyzer = new TreeSitterAstAnalyzer(undefined, () => new Date("2026-05-28T20:00:00.000Z"));
  const result = await analyzer.analyze({
    candidates: [
      candidate({
        path: "src/Broken.tsx",
        language: "typescript",
        content: "export function Broken( { return <main>",
      }),
    ],
  });

  assert.equal(result.status, "failed");
  assert.equal(result.documents[0].parseStatus, "parse_error");
  assert.equal(result.summary.hasBlockingDiagnostics, true);
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "parse_error"));
});

test("TreeSitterAstAnalyzer reports unsupported languages explicitly", async () => {
  const analyzer = new TreeSitterAstAnalyzer(undefined, () => new Date("2026-05-28T20:00:00.000Z"));
  const result = await analyzer.analyze({
    candidates: [
      candidate({
        path: "src/styles/app.css",
        language: "css",
        content: ".button { color: red; }",
      }),
    ],
  });

  assert.equal(result.status, "failed");
  assert.equal(result.documents[0].parseStatus, "unsupported_language");
  assert.equal(result.summary.unsupportedDocumentCount, 1);
});

function candidate({ path, language, content }) {
  return {
    path,
    language,
    bytes: Buffer.byteLength(content, "utf-8"),
    content,
    startLine: 1,
    endLine: Math.max(1, content.split("\n").length),
    score: 100,
    matchedTerms: [],
    excerpts: [],
  };
}
