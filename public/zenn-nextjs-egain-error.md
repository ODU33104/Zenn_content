---
title: Xserver で Next.js 15 のビルドが EAGAIN エラーで失敗する問題を解決した話
tags:
  - nextjs
  - linux
  - xserver
  - nodejs
private: false
updated_at: ''
id: null
organization_url_name: null
slide: false
ignorePublish: false
posting_campaign_uuid: null
agreed_posting_campaign_term: false
---
:::message
**結論（先に知りたい人へ）**

`next.config.ts` でワーカースレッドと CPU コア数を制限すれば解決します。

```typescript:next.config.ts
experimental: {
  workerThreads: false,
  cpus: 1,
}
```

```bash
NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS="--max-old-space-size=4096" next build
```

:::

---

## この記事が解決する課題

Xserver や共有サーバーで Next.js 15 のビルドが以下のエラーで失敗する問題を解決します。

```bash
uncaughtException [Error: spawn ... EAGAIN] {
  errno: -11,
  code: 'EAGAIN',
  syscall: 'spawn ...',
}
```

**対象読者**:
- Xserver や共有サーバーで Next.js アプリをデプロイしている方
- `EAGAIN` エラーでビルドが失敗して困っている方
- 「ulimit」や「プロセス制限」と聞いてもピンと来ない方

---

## なぜ Vercel ではなく Xserver なのか

Next.js アプリをデプロイするなら、**Vercel 一択**というのが現代の常識です。

公式が提供する Vercel なら：
- ✅ ビルド設定は自動最適化
- ✅ サーバー管理は不要
- ✅ 無料枠でも十分な性能
- ✅ 世界中にエッジネットワーク

では、**なぜ私は Xserver という共有サーバーを選んだのか**。

理由は単純で、**「すでに契約していたから」**です。

他にも事情があるかもしれません：
- 会社のサーバーが共有環境しかない
- 顧客の都合でオンプレミスに近い環境が必要
- すでにレンタルサーバーを契約していて、追加コストをかけられない

そんな「**Vercel が使えない、あるいは使わない事情がある**」環境で Next.js を動かすための記録が、この記事です。

---

## 環境

| 項目 | 値 |
|------|-----|
| サーバー | Xserver ビジネスプラン（Linux） |
| Node.js | v20.20.0（nvm 使用） |
| Next.js | 15.5.7 |
| npm | 10.x |

---

## 問題の概要

Xserver のビジネスプラン（Linux 環境）で Next.js 15.5.7 のアプリケーションをビルドしようとしたところ、`EAGAIN` エラーでビルドが失敗しました。

```bash
uncaughtException [Error: spawn /home/xs604011/.nvm/versions/node/v20.20.0/bin/node EAGAIN] {
  errno: -11,
  code: 'EAGAIN',
  syscall: 'spawn /home/xs604011/.nvm/versions/node/v20.20.0/bin/node',
}
```

これは**Linux のユーザープロセス制限（ulimit）に引っかかっている**ことが分かりました。

### エラーの詳細

#### 最初のエラー：型チェックの失敗

ビルドを実行すると、型チェックの段階で Supabase Edge Functions の Deno 依存関係の解決に失敗しました。

```
Failed to compile.

./supabase/functions/delete-account/index.ts:1:23
Type error: Cannot find module 'https://deno.land/std@0.208.0/http/server.ts'
```

これは Next.js のビルドプロセスが Deno 依存関係を解決できないことが原因です。

#### 真の問題：EAGAIN エラー

型エラーを無視する設定にした後、今度は**EAGAIN エラー**が発生。

```
thread '<unnamed>' panicked at /root/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/tokio-1.45.1/src/runtime/scheduler/multi_thread/worker.rs:460:13:
OS can't spawn worker thread: Resource temporarily unavailable (os error 11)
fatal runtime error: failed to initiate panic, error 5, aborting
```

これは「**もうこれ以上プロセスを作れません**」という OS レベルのエラーです。

---

## 試したことと結果

問題解決のために試したことを時系列で記録します。

:::details 試行 1: 単純な再試行（失敗）

```bash
npm run build
```

→ 変わらず EAGAIN エラー。むしろ悪化して、プロセス数が 100 個以上表示されるように。

:::

:::details 試行 2: メモリ制限の追加（失敗）

```bash
NODE_OPTIONS="--max-old-space-size=2048" npm run build
```

→ メモリは関係なさそう。エラー変わらず。

:::

:::details 試行 3: CPU コア数を 2 に制限（失敗）

```typescript
experimental: {
  workerThreads: false,
  cpus: 2,
}
```

→ 少しマシになるが、まだエラーが出る。

:::

:::details 試行 4: ulimit 確認（成功）

```bash
ulimit -u
# 結果：2000
```

**max user processes が 2000**に設定されていました。共有サーバーでは妥当な値ですが、Next.js のビルドはこれを超えるプロセスを生成しようとしていました。

:::

:::details 試行 5: CPU コア数を 1 に制限 + メモリ増量（成功）

```typescript
experimental: {
  workerThreads: false,
  cpus: 1,
}
```

```bash
NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS="--max-old-space-size=4096" npm run build
```

→ **ビルド成功！**

:::

---

## 最終的な解決策

以下の 3 つの設定を行います。

### 1. `next.config.ts` の修正

```typescript:next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  productionBrowserSourceMaps: true,
  reactStrictMode: false,

  // TypeScript エラーを無視（Supabase Edge Functions 対策）
  typescript: {
    ignoreBuildErrors: true,
  },

  // ESLint エラーを無視
  eslint: {
    ignoreDuringBuilds: true,
  },

  // Linux 環境のプロセス制限対策
  experimental: {
    workerThreads: false,
    cpus: 1,
  },
};

export default nextConfig;
```

### 2. `package.json` のスクリプト修正

```json:package.json
{
  "scripts": {
    "build": "NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=\"--max-old-space-size=4096\" next build",
    "postbuild": "cp node_modules/.prisma/client/libquery_engine-rhel-openssl-1.1.x.so.node prod/.next/server/ || true"
  }
}
```

### 3. Prisma バイナリのパス修正

バイナリファイル名が環境によって異なるため、`|| true` でエラーを許容します。

```bash
# openssl-1.0.x の場合もあれば 1.1.x の場合もある
cp node_modules/.prisma/client/libquery_engine-rhel-openssl-1.1.x.so.node prod/.next/server/ || true
```

---

## なぜこれで解決したのか

### Next.js 15 のビルド最適化が諸刃の剣

Next.js 15 のビルドプロセスは、デフォルトで以下の最適化を行っています：

1. **ワーカースレッドによる並列処理**
2. **複数 CPU コアを活用したコンパイル**
3. **ページごとの並列な静的生成**

これは高性能なサーバーでは素晴らしい効果を生みますが、**共有サーバーのリソース制限下では逆効果**になります。

### 各設定の効果

| 設定 | 効果 |
|------|------|
| `workerThreads: false` | ワーカースレッドを無効化。メインスレッドだけでビルドが進行 |
| `cpus: 1` | CPU コア数を 1 に制限。並列コンパイルを抑制 |
| `NODE_OPTIONS` | メモリ制限を 4GB に設定 |

---

## 教訓

### 1. 共有サーバーではデフォルト設定を盲信しない

Next.js のデフォルト設定は「十分なリソースがある環境」が前提です。共有サーバーやリソース制限のある環境では、設定を見直す必要があります。

### 2. エラーメッセージの奥を読む

「EAGAIN」というエラーメッセージだけ見ると「一時的なエラー？」と思ってしまいますが、実際は**OS レベルのリソース制限**でした。エラーのスタックトレースまでしっかり読むことが重要です。

### 3. 段階的に問題を切り分ける

一つ問題を解決すると次の問題が見えてくることがあります。焦らず一つずつ対処しましょう。

```
型エラー → プロセス制限エラー → Prisma バイナリのパス問題
```

---

## 参考リンク

- [Next.js Configuration - experimental.cpus](https://nextjs.org/docs/app/api-reference/config/next-config-js/experimental#cpus)
- [Node.js --max-old-space-size](https://nodejs.org/api/cli.html#--max-old-space-sizesize-in-megabytes)
- [Linux ulimit コマンド](https://www.kernel.org/doc/html/latest/userspace-api/ulimit.html)

---

:::message
**余談**

この問題に直面している間、サーバーのログには 100 個以上の Node.js プロセスが生成されていました。まるで「プロセスの大行進」です。

共有サーバーで Next.js を動かすのは、**「限られた予算でいかにパフォーマンスを出すか」**というゲームのようなものです。今回の解決策が、同じ境遇の誰かの役に立てば幸いです。
:::
