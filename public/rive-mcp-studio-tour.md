---
title: rive-mcpにブラウザだけで動くRive編集Studioを足した
tags:
  - rive
  - mcp
  - claude
  - typescript
private: false
updated_at: ''
id: null
organization_url_name: null
slide: false
ignorePublish: false
posting_campaign_uuid: null
agreed_posting_campaign_term: false
---
rive-mcpにブラウザだけで動くRive編集画面を足した。Studioと呼んでいる。Riveの公式エディタを一度も起動せずに、生成した.rivをその場で確認しながら手で微調整できる。

前回の記事では「.rivをJSONから生成するMCPサーバー」としての全体像を書いた。あれから触り続けているうちにStudio側の機能がかなり増えたので、今回は画面と一緒に7つの機能を紹介する。

https://github.com/ODU33104/rive-mcp

## タイムラインで全トラックのキーフレームを見渡せる

画面下部には、トラックごとのキーフレームを並べたドープシートがある。ズームで細かい区間に寄れて、再生速度も変えられる。細部を詰めたいときも、全体の流れをつかみたいときも、同じ画面で済む。

![タイムライン](https://raw.githubusercontent.com/ODU33104/rive-mcp/main/docs/media/studio-timeline.png)

## カーブエディタで制御点を直接ドラッグしてイージングを作れる

これまでイージングは、linearやease-inのような名前つきの種類を選ぶだけで、曲線そのものを触る手段がなかった。キーフレーム区間を選ぶと、ベジェの制御点をドラッグできるエディタが開く。hold・linear・cubicの切り替えと、よく使う10種のプリセットもワンクリックで当てられるようにした。

実装で地味に手間取ったのが、区間とキーフレームのズレだった。.rivのバイナリ仕様上、イージングのデータは区間の終点ではなく始点のキーフレームに乗っている。画面では「区間を選んで動かす」という感覚のまま操作させたかったので、内部では選んだ区間から1つ前のキーフレームへ書き込み先をずらす変換を挟んでいる。

![カーブエディタ](https://raw.githubusercontent.com/ODU33104/rive-mcp/main/docs/media/studio-curve.png)

## ステートマシングラフは遷移とlintの結果を同じ画面で見せる

状態遷移は、これまでJSON越しにしか確認できなかった。レイヤー・状態・遷移をノードグラフとして表示し、遷移をクリックするとduration・exitTime・条件（入力名・演算子・値）が出るようにした。

`riv_lint`の走査結果もそのまま乗せてある。到達不能なstateは赤、条件なしの自己遷移（無限ループの原因になる）は黄色でハイライトされる。再生中は今アクティブなstateが緑に光るので、「なぜここで止まっているか」をJSONを読まずに確認できるようになった。

![SMグラフビュー](https://raw.githubusercontent.com/ODU33104/rive-mcp/main/docs/media/studio-smgraph.png)

## 実行パネルでブラウザからbool・triggerを操作できる

グラフの隣には、入力を直接いじれるパネルを置いた。bool入力のON/OFFやtriggerの発火をボタン一つで試せて、遷移がその場で起きる。CLIで`riv_play_state_machine`を叩かなくても、ブラウザだけで動作確認が済むようになった。

![SM実行パネル](https://raw.githubusercontent.com/ODU33104/rive-mcp/main/docs/media/studio-sm-inputs.png)

## オニオンスキンで前後フレームの軌跡を重ねて見られる

前後0〜5フレームを、現在のフレームからの距離に応じた濃さで重ねて表示する。アニメーション制作ツールではおなじみの機能だ。これがあると、オブジェクトが実際にどんな軌跡を描いているかを静止画のまま把握できる。動きが直線的すぎないか、カーブがどこかで破綻していないか。再生せずに確認できるようになった。

![オニオンスキン](https://raw.githubusercontent.com/ODU33104/rive-mcp/main/docs/media/studio-onion.png)

## インスペクタで選択した要素をその場で編集できる

階層ツリーかキャンバス上で要素を選ぶと、位置・回転・スケール・色・テキストをインスペクタから直接変更できる。undo/redoも普通に効く。JSONを書き直してリロードする手間が要らなくなった分、細部の調整はこちらで済ませることが増えた。

![インスペクタ編集](https://raw.githubusercontent.com/ODU33104/rive-mcp/main/docs/media/studio-edit.png)

## 「AIへの指示」は選択状態を自動で添付する

右側にある「AIへの指示」ボックスに修正依頼を書いて送ると、そのとき選択していたオブジェクト・アートボード・アニメーション・再生時刻が自動で添付される。AI側は`riv_studio_notes`というツールでそれを受け取る。

これが地味に効く。人間が「これをもう少し右」とだけ書いても、「これ」が指す対象をAIがUIの状態から拾えるので、指示の精度が上がった。

![AIへの指示](https://raw.githubusercontent.com/ODU33104/rive-mcp/main/docs/media/studio-notes.png)

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
