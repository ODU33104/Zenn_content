import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";

const ARTICLES_DIR = "articles";
const PUBLIC_DIR = "public";
// Qiita の WAF がシェルスクリプトの一部パターン（cp ... || true、エスケープ済み引用符入りJSON等）を
// OSコマンドインジェクションと誤検知し 403 Forbidden で弾くケースがある。個別に切り分けが済むまで除外する。
const QIITA_EXCLUDE = new Set(["zenn-nextjs-egain-error"]);
const ZENN_IMAGE_BASE = "/images/rive-mcp/";
const GITHUB_IMAGE_BASE =
  "https://raw.githubusercontent.com/ODU33104/rive-mcp/main/docs/media/";

function rewriteImagePaths(body) {
  return body.split(ZENN_IMAGE_BASE).join(GITHUB_IMAGE_BASE);
}

function splitFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error("frontmatter not found");
  const [, fm, body] = m;
  return { data: yaml.load(fm) ?? {}, body };
}

function convert(slug) {
  const zennPath = path.join(ARTICLES_DIR, `${slug}.md`);
  const qiitaPath = path.join(PUBLIC_DIR, `${slug}.md`);

  const { data: zenn, body } = splitFrontmatter(fs.readFileSync(zennPath, "utf8"));

  if (!zenn.published) {
    console.log(`skip (draft on Zenn): ${slug}`);
    return;
  }

  const existing = fs.existsSync(qiitaPath)
    ? splitFrontmatter(fs.readFileSync(qiitaPath, "utf8")).data
    : {};

  const qiitaFrontmatter = {
    title: zenn.title,
    tags: zenn.topics && zenn.topics.length ? zenn.topics : ["zenn"],
    private: false,
    updated_at: existing.updated_at ?? "",
    id: existing.id ?? null,
    organization_url_name: existing.organization_url_name ?? null,
    slide: false,
    ignorePublish: QIITA_EXCLUDE.has(slug),
    posting_campaign_uuid: existing.posting_campaign_uuid ?? null,
    agreed_posting_campaign_term: existing.agreed_posting_campaign_term ?? false,
  };

  const out =
    "---\n" +
    yaml.dump(qiitaFrontmatter, { lineWidth: -1 }) +
    "---\n" +
    rewriteImagePaths(body.trimStart());

  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  fs.writeFileSync(qiitaPath, out);
  console.log(`converted: ${zennPath} -> ${qiitaPath}`);
}

const slugs = process.argv.slice(2);
if (slugs.length) {
  slugs.forEach(convert);
} else {
  for (const file of fs.readdirSync(ARTICLES_DIR)) {
    if (file.endsWith(".md")) convert(file.replace(/\.md$/, ""));
  }
}
