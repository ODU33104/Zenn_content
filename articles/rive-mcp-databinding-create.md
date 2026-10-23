---
title: "Riveのデータバインディングを、エディタを開かずに.rivへ書き込めるようにした"
emoji: "🎚️"
type: "tech"
topics: ["rive", "mcp", "claude", "animation", "typescript"]
published: true
---

[rive-mcp](https://github.com/ODU33104/rive-mcp)（Riveのエディタを起動せずに.rivを作って編集できるMCPサーバー）は、[以前の記事](https://zenn.dev/udos/articles/rive-mcp-databinding-parser)でデータバインディングを「読む」ところまで対応した。その記事の最後に「次は書く側をやりたい」と書いたので、今回はその続きになる。ViewModelの定義と、それを図形や文字に結ぶ配線を、`riv_create` で.rivに書き込めるようにした。

## データバインディングは「差し込み印刷」に近い

データバインディングを知らない人向けに、先に仕組みを説明しておく。

Riveのアニメーションは、ふつうは見た目も値もファイルの中で決まっている。HPバーの長さを変えたければ、アプリのコードからステートマシンの入力を叩くか、ファイルを作り直すことになる。

データバインディングを使うと、ファイルの中に「ここには外から来た値を入れる」という穴を空けておける。Wordの差し込み印刷で、宛名の欄だけを住所録から流し込むのと同じ考え方だ。穴の一覧（どんな名前で、どんな型の値が入るか）を定義したものをViewModelと呼ぶ。

下のGIFは、同じデザインのカードに3種類の値を流し込んだものだ。

![同じカードに3種類の値を流し込んだ例](/images/rive-mcp/databinding-card-swap.gif)

3枚とも、図形や文字の配置はまったく同じで、違うのはViewModelに入れた値だけだ。このカードでは4つの穴を結んでいる。

| ViewModelの値 | 型 | 結んだ先 | 見た目の変化 |
|---|---|---|---|
| `name` | 文字 | 名前のテキスト | KNIGHT / GOBLIN / DRAGON |
| `hp` | 数値 | バーの横幅 | 85 / 45 / 12 でバーの長さが変わる |
| `barColor` | 色 | バーの塗り | 緑 / 黄 / 赤 |
| `shielded` | 真偽値 | 盾アイコンの表示 | true のときだけ盾が出る |

アプリ側は値を入れるだけでよく、「HPが減ったらバーを縮める」「色を変える」といった処理はファイル側に入っている。デザイナーが見た目を直しても、アプリのコードを触らずに済む。

## AIに頼むと、配線まで書かれた.rivが出てくる

使い方は、Claude CodeなどのMCPクライアントに頼むだけだ。たとえばこう書く。

> 名前・HPバー・盾アイコンが付いたキャラクターのステータスカードを作って。名前、HP（0〜100）、バーの色、盾の有無はViewModelにつないで、アプリから変えられるようにして。

すると、AIが `riv_create` に次のような指定を渡す（抜粋）。

```json
{
  "viewModel": "Unit",
  "viewModels": [{
    "name": "Unit",
    "properties": [
      { "name": "name", "type": "string" },
      { "name": "hp", "type": "number" },
      { "name": "barColor", "type": "color" },
      { "name": "shielded", "type": "boolean" }
    ]
  }],
  "shapes": [{
    "id": "bar", "type": "rect",
    "fill": { "color": "#4ADE80", "bind": { "source": "barColor" } },
    "binds": [{
      "source": "hp", "property": "scaleX",
      "converter": { "type": "rangeMapper", "minInput": 0, "maxInput": 100, "minOutput": 0, "maxOutput": 1 }
    }]
  }]
}
```

`bind` が「この塗りは `barColor` の値で決める」という配線で、`binds` は位置・大きさ・回転・不透明度のような数値を結ぶ欄だ。HPは0〜100で来るが、バーの伸び縮み（`scaleX`）は0〜1なので、間に `rangeMapper` という変換器をはさんで 0〜100 を 0〜1 に読み替えている。

できた.rivは公式のランタイムで読み込んで検証され、プレビュー画像も一緒に返ってくる。上のGIFの3枚は、この指定の値の部分だけを変えて作った。

## アプリ側では、値を代入するだけ

Webなら公式の `@rive-app/canvas` で読み込み、`autoBind: true` にすると、ファイルに書いたViewModelが自動で結ばれる。あとは値を代入すればカードが変わる。

```ts
import { Rive } from "@rive-app/canvas";

const rive = new Rive({
  src: "card.riv",
  canvas: document.querySelector("canvas")!,
  stateMachines: "Auto Generated State Machine",
  autoBind: true,
  autoplay: true,
  onLoad: () => {
    const vm = rive.viewModelInstance!;
    vm.string("name")!.value = "DRAGON";
    vm.number("hp")!.value = 12;
    vm.color("barColor")!.rgb(248, 113, 113);
    vm.boolean("shielded")!.value = true;
  },
});
```

KNIGHTのカードのファイルを読み込み、このコードで値を入れると、ブラウザ上でDRAGONのカードに変わることを確かめた。ゲームのHP表示、ダッシュボードの数値、ログイン中のユーザー名の表示などは、この形で書ける。

## 対応している配線

| 種類 | 結べる先 |
|---|---|
| 文字 | テキストの中身 |
| 数値 | 位置（x/y）・横幅・高さ・回転・拡大率・不透明度 |
| 色 | 塗りの色 |
| 真偽値 | 塗り・線の表示と非表示 |
| ViewModelの入れ子 | `profile.name` のように `.` でたどれる |
| リスト | 書き込みのみ（下を参照） |
| 変換器 | 数値の範囲の読み替え（`rangeMapper`） |

## できないこと・注意点

- **列挙型（enum）の値を、そのまま文字として表示することはできない。** 一度「動く」と判断したが、画像を目で見直したら初期の文字のままだった。文字を差し替えたいときは文字列型を使う
- **リストは書き込めるが、要素を並べて表示する仕組みはまだない。** 中身は `riv_inspect` で読める
- **このサーバーのプレビューは、最初のインスタンスの値で描く。** 値を変えた見た目を確かめたいときは、上のGIFのように値を変えたファイルを作る
- **文字を後から差し替えるなら、フォントに文字を残しておく。** `riv_create` はファイルを小さくするため、使った文字だけをフォントに埋め込む。差し替える予定の文字を `fonts[].subset` に渡しておかないと、その文字が出ない
- **バーを左端から伸ばしたいときは、図形の原点を左端に置く。** 幅をそのまま結ぶと中央から両側に伸びる。上の例では、図形の位置を左端にし、四角形の描画位置（`pathX`）を幅の半分だけずらしたうえで `scaleX` を結んでいる

## 実装でつまずいたところ

一番時間を使ったのは、「数値を結ぶと図形が消える」症状だった。色と文字を結ぶと正しく出るのに、横幅を結ぶとバーそのものが描かれない。

最初はランタイム側の不具合だと考え、Riveのリポジトリにissueまで出してしまった。原因はこちらの書き出し側にあった。.rivの中のオブジェクトは「親は何番目のオブジェクトか」を番号で指していて、番号は図形などの部品を書くたびに1つ進む。ところが配線を表すオブジェクト（DataBindContext）は部品として数えられないのに、書き出し側はそれも数えて番号を進めていた。そのため、配線より後に書いたオブジェクトの親の番号が1つずれていた。色と文字では、たまたま配線が最後に書かれるので影響が出ず、横幅のときだけ塗りが自分自身を親に指す壊れた状態になっていた。

修正したあと、issueには「こちらの不具合だった」と書いて閉じた。同じ種類の壊れ方を見つけられるよう、`riv_lint` に親の番号が自分自身や未登場のオブジェクトを指していないかを調べる検査を足してある。

## 入れ方

`npm install -g rive-mcp-server` で入る。Claude Codeならプラグインとしても入れられる。

```
/plugin marketplace add ODU33104/rive-mcp
/plugin install rive-mcp@rive-tools
```

ツールは32個ある。データバインディングの書式は `docs/riv-format.md` の「Data Binding / ViewModel」節にまとめた。

https://github.com/ODU33104/rive-mcp
