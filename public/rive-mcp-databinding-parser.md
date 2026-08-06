---
title: Riveのデータバインディングを自前パーサで読めるようにしたら、読み違いが1つ見つかった
tags:
  - Rive
  - MCP
  - TypeScript
  - Claude
private: false
updated_at: '2026-08-07T08:55:12+09:00'
id: f517e370cc96c70651da
organization_url_name: null
slide: false
ignorePublish: false
posting_campaign_uuid: null
agreed_posting_campaign_term: false
---
[rive-mcp](https://github.com/ODU33104/rive-mcp)（Riveのエディタを起動せずに.rivを作って編集できるMCPサーバー。[前回の記事](https://zenn.dev/udos/articles/rive-mcp-no-editor-tool)）に、データバインディングの中身を読む機能を足した。やることは「バイナリを解析して構造を表示する」だけのはずだったのに、途中で既存パーサの読み違いが出てきて、修正の影響はそちらのほうが大きかった。今回はその話を中心に、v0.5.0で入った他の機能も並べておく。

## データバインディングは、値の流れそのものが.rivに埋まっている

Riveのデータバインディングは、アニメーションのプロパティを外から差し込んだ値に追従させる仕組みだ。ViewModelという型を定義し、そのインスタンスが持つプロパティを、アートボード上のオブジェクトのプロパティに結びつける。「テキストの中身をアプリ側の変数で置き換える」「数値の大小で色を変える」といった、従来ならコードで書いていた部分がファイル側に入る。

つまり.rivを外から見るとき、キーフレームだけ見ても動きの全体像がわからないファイルが存在する、ということでもある。そこで `riv_inspect` に `dataBinding` フィールドを足して、ViewModelの定義、インスタンスと解決済みの値、DataEnum、コンバーター（値の変換器。19種類ほどある）、そしてバインディングそのもの（結び先・フラグ・ソースパス）を列挙するようにした。

## `List<Id>` を varuint 1個だと思っていたのが原因だった

作業を始めてすぐ、データバインディングを含むファイルでオブジェクト列が途中から意味不明になることに気づいた。

.rivのオブジェクトは、typeKeyに続いて (propertyKey, 値) の並びが来て、propertyKeyが0で終端する、という素朴な構造をしている。値が何バイトかはpropertyKeyごとの型で決まり、その対応表はランタイム由来の登録簿（`vendor/rive-defs/defs.json`）から引いている。可変長整数、float32、長さ接頭辞付きの文字列——ここまでは問題なかった。

引っかかったのは `DataBindContext.sourcePathIds` の型で、defs上の表記は `List<Id>` だ。Idなのだからvaruint 1個だろう、と読んでいた。実際はランタイム側で `CoreBytesType` として直列化されていて、文字列と同じ「varuintの長さ + 生バイト列」の形をとる。中身はvaruintを詰めただけの列で、長さは可変だ。

こうなると、1バイトでもずれた瞬間に以降のpropertyKeyがすべてゴミになる。厄介なのは、**ずれても例外が飛ばない**ことだった。読み違えたバイト列がたまたま0に当たれば「オブジェクトの終端」に見えるし、既知のtypeKeyに当たれば「次のオブジェクトが始まった」ように見える。エラーにならず、それらしい構造のまま静かに壊れたデータが返る。この手のバグは、出力を眺めているだけでは気づきにくい。

直したあと、手元の実ファイル10本（合計7,820オブジェクト）を通してパースエラーがゼロになることを確認した。データバインディングを使っている.rivは、これまで解析結果が丸ごと信用できない状態だったわけで、機能追加というより静かな不具合の修正に近い。

書式そのものは `docs/riv-format.md` の「Data Binding / ViewModel」節に書き足した。同じところで詰まる人がいたら参考になると思う。

## 音声は埋め込めるが、このサーバーのプレビューでは鳴らない

`riv_create` でWAV・MP3・FLACを埋め込めるようにした。AudioAsset（typeKey 406）とFileAssetContentsとして書き込み、タイムライン上の指定フレームからKeyFrameCallback経由で鳴らすか、ステートマシンの状態遷移時にStateMachineFireEventで鳴らすかを選べる。

ただし、レンダリングに使っているCanvas2Dベースのランタイムでは音が再生されない。書き込みは正しく、実際のプレイヤーでは鳴るが、このサーバーのプレビューでは確認できない、という状態になっている。Featherと同じ扱いだ。

## Studioでは骨をドラッグして回せる

ブラウザ上で動く編集画面（Studio）には、ボーンの骨格をキャンバスに重ねて表示する機能を足した。一時停止中に骨をドラッグすれば回転し、その姿勢をそのまま再生ヘッド位置のキーフレームとして書き出せる。もちろんundoも効く。

![ボーンオーバーレイ](https://raw.githubusercontent.com/ODU33104/rive-mcp/main/docs/media/studio-bones.png)

現状の表示は定義された値をもとに組み立てた骨格なので、再生ヘッドのフレームで補間した姿勢とは一致しない。ここは次に直したい。

## ドープシートで複数のキーフレームをまとめて動かせる

キーフレームを矩形選択とShift+クリックで複数選び、まとめてドラッグできるようにした。衝突したときは詰めて解決する。Ctrl+C / Ctrl+V は再生ヘッド位置を基準に貼り付き、カスタムのイージングカーブも保ったままコピーされる。

![ドープシートの複数選択](https://raw.githubusercontent.com/ODU33104/rive-mcp/main/docs/media/studio-dopesheet.png)

複数アートボードを持つファイルはタブで切り替えられるようになり、埋め込み画像はPNG/JPEG/WebPをドロップするだけで差し替えられる。差し替えは無損失で、ファイルの他の部分はバイト単位でそのまま残る。名前を付けて状態を保存しておくスナップショット機能も入れた。

![アートボードタブとスナップショット](https://raw.githubusercontent.com/ODU33104/rive-mcp/main/docs/media/studio-artboards.png)

## 書き出しの一括処理と、2ファイルの並置比較

`riv_batch_render` は、複数の.rivを複数フォーマットへ一度に書き出す。globが使えて、1ファイルが失敗しても他のジョブは止まらない。`riv_ab_compare` のほうは、2つの.rivを同じ条件でレンダリングして、ラベルを焼き込んだ横並びのGIF/APNGを作る。尺が違う場合は短いほうが最終フレームで止まる。修正前後の見比べをCIに載せる用途を想定している。

## ツールは30個になった

インストールは `npm install -g rive-mcp-server`、Claude Codeのプラグインとしても入る。

```
/plugin marketplace add ODU33104/rive-mcp
/plugin install rive-mcp@rive-tools
```

読む側はデータバインディングまで届いたので、次は書く側——ViewModelの定義とバインディングを.rivに書き込むところをやりたい。ここまで対応しているツールは今のところ見当たらないので、作る価値はあるはずだ。

https://github.com/ODU33104/rive-mcp
