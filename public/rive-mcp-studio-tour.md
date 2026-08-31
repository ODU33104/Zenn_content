---
title: rive-mcpのWebスタジオ、機能がだいぶ増えたので7つ紹介する
tags:
  - Rive
  - MCP
  - Claude
  - TypeScript
private: false
updated_at: '2026-08-31T21:20:29+09:00'
id: e47549a51a2ed8206583
organization_url_name: null
slide: false
ignorePublish: false
posting_campaign_uuid: null
agreed_posting_campaign_term: false
---
前回の記事（[Riveのエディタを起動せずに.rivを作って編集できるMCPサーバーを作った](https://zenn.dev/udos/articles/rive-mcp-no-editor-tool)）で、rive-mcpというMCPサーバー全体の話を書いた。そのときブラウザだけで動く編集画面Studioも軽く紹介したが、あれから触り続けているうちに機能がかなり増えたので、今回は画面と一緒に7つの機能をあらためて紹介する。

**2026-08-06追記**: UIを公式Riveエディタのレイアウトに近づける形で全面的に刷新した。階層ツリー、Inspectorの各プロパティ行に付くダイヤ型のキーボタン、下部のステータスバー（Console・Problems・Changes）など、操作の場所を公式の作法に揃えている。以下のスクリーンショットのうち一部は刷新後の画面に差し替えた。

https://github.com/ODU33104/rive-mcp

## タイムラインで全トラックのキーフレームを見渡せる

画面下部には、トラックごとのキーフレームを並べたドープシートがある。ズームで細かい区間に寄れて、再生速度も変えられる。細部を詰めたいときも、全体の流れをつかみたいときも、同じ画面で済む。

![タイムライン](https://raw.githubusercontent.com/ODU33104/rive-mcp/main/docs/media/studio-timeline-v05.jpg)

## カーブエディタで制御点を直接ドラッグしてイージングを作れる

これまでイージングは、linearやease-inのような名前つきの種類を選ぶだけで、曲線そのものを触る手段がなかった。キーフレーム区間を選ぶと、ベジェの制御点をドラッグできるエディタが開く。hold・linear・cubicの切り替えと、よく使う10種のプリセットもワンクリックで当てられるようにした。

実装で地味に手間取ったのが、区間とキーフレームのズレだった。.rivのバイナリ仕様上、イージングのデータは区間の終点ではなく始点のキーフレームに乗っている。画面では「区間を選んで動かす」という感覚のまま操作させたかったので、内部では選んだ区間から1つ前のキーフレームへ書き込み先をずらす変換を挟んでいる。

![カーブエディタ](https://raw.githubusercontent.com/ODU33104/rive-mcp/main/docs/media/studio-curve.png)

## ステートマシングラフは遷移とlintの結果を同じ画面で見せる

状態遷移は、これまでJSON越しにしか確認できなかった。レイヤー・状態・遷移をノードグラフとして表示し、遷移をクリックするとduration・exitTime・条件（入力名・演算子・値）が出るようにした。

`riv_lint`の走査結果もそのまま乗せてある。到達不能なstateは赤、条件なしの自己遷移（無限ループの原因になる）は黄色でハイライトされる。再生中は今アクティブなstateが緑に光るので、「なぜここで止まっているか」をJSONを読まずに確認できるようになった。

![SMグラフビュー](https://raw.githubusercontent.com/ODU33104/rive-mcp/main/docs/media/studio-smgraph-v05.jpg)

## 実行パネルでブラウザからbool・triggerを操作できる

グラフの隣には、入力を直接いじれるパネルを置いた。bool入力のON/OFFやtriggerの発火をボタン一つで試せて、遷移がその場で起きる。CLIで`riv_play_state_machine`を叩かなくても、ブラウザだけで動作確認が済むようになった。

![SM実行パネル](https://raw.githubusercontent.com/ODU33104/rive-mcp/main/docs/media/studio-sm-inputs.png)

## オニオンスキンで前後フレームの軌跡を重ねて見られる

前後0〜5フレームを、現在のフレームからの距離に応じた濃さで重ねて表示する。アニメーション制作ツールではおなじみの機能だ。これがあると、オブジェクトが実際にどんな軌跡を描いているかを静止画のまま把握できる。動きが直線的すぎないか、カーブがどこかで破綻していないか。再生せずに確認できるようになった。

![オニオンスキン](https://raw.githubusercontent.com/ODU33104/rive-mcp/main/docs/media/studio-onion.png)

## インスペクタで選択した要素をその場で編集できる

階層ツリーかキャンバス上で要素を選ぶと、位置・回転・スケール・色・テキストをインスペクタから直接変更できる。undo/redoも普通に効く。JSONを書き直してリロードする手間が要らなくなった分、細部の調整はこちらで済ませることが増えた。

![インスペクタ編集](https://raw.githubusercontent.com/ODU33104/rive-mcp/main/docs/media/studio-edit.png)

## Agentパネルは投稿箱ではなく会話になった

もともとは「AIへの指示」というテキストボックスに書いて送るだけの、一方通行の投稿箱だった。送った内容は選択オブジェクト・アートボード・アニメーション・再生時刻が自動で添付されて`riv_studio_notes`経由でAIに届くが、AIが何をしたか・なぜそうしたかはStudio側に一切戻ってこなかった。触ってみると「送っても何も起きていないように見える」という不便さが目立った。

刷新後は会話になった。左パネルの`Agent`アコーディオンの中で、吹き出し形式のやり取りが進む。AI側は作業が終わったら`riv_studio_notes`の`reply`引数で返信を投げ、それが即座に吹き出しとしてUIに反映される。送信時に添付された文脈（選択・アートボードなど）は吹き出しの下にチップとして表示される。何を送ったかも後から追える。

![Agentパネルの双方向チャット](https://raw.githubusercontent.com/ODU33104/rive-mcp/main/docs/media/studio-agent-chat-v05.jpg)

## 導入は2行で終わる

```bash
npm install -g rive-mcp-server
claude mcp add --scope user rive -- rive-mcp
```

Claude Codeを使っているなら、プラグインとして入れる方が早い。

```
/plugin marketplace add ODU33104/rive-mcp
/plugin install rive-mcp@rive-tools
```

あとは`riv_studio`を呼べば、この画面がブラウザで開く。

無料で使えるが、source-availableというライセンスで、OSSではない。改変や再配布はできないが、生成物の利用は自由にしている。ツール全体の作り方や、AIに素材の質を担保させる仕組みについては前回の記事にまとめた。

https://zenn.dev/udos/articles/rive-mcp-no-editor-tool

https://github.com/ODU33104/rive-mcp
