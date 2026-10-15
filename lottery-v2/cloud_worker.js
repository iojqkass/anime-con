/* ============================================================
 * 马牌抽奖系统 · Cloudflare Worker（记录云同步）
 * 部署：Workers + KV（KV namespace 名：MAPAI_RECORDS）
 * API：
 *   GET  /api/records?project=xxx          → 项目全部云端记录
 *   POST /api/record                       → 上报/覆盖一条记录（body: 记录JSON）
 *   DELETE /api/record?project=xxx&rid=yy  → 删除一条记录
 *   DELETE /api/project?project=xxx        → 清空整个项目的云端记录
 * 所有接口 CORS 开放（GitHub Pages 跨域调用）
 * ============================================================ */
'use strict';

const KV = MAPAI_RECORDS;

function json(res, status) {
  return new Response(JSON.stringify(res), {
    status: status || 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}

function recKey(projectId, rid) {
  return 'rec:' + projectId + ':' + rid;
}

async function handleGET(url) {
  const sp = url.searchParams;
  const project = sp.get('project');
  if (!project) return json({ ok: false, error: 'missing project' }, 400);

  const list = await KV.list({ prefix: 'rec:' + project + ':' });
  const out = [];
  for (const k of list.keys) {
    const v = await KV.get(k.name);
    if (v) {
      try { out.push(JSON.parse(v)); } catch (e) { /* 跳过坏数据 */ }
    }
  }
  out.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  return json({ ok: true, project: project, count: out.length, records: out });
}

async function handlePost(req) {
  let body;
  try { body = await req.json(); } catch (e) { return json({ ok: false, error: 'bad json' }, 400); }
  const project = body.projectId || body.project;
  const rid = body.rid;
  if (!project || !rid) return json({ ok: false, error: 'missing projectId/rid' }, 400);

  // 同项目同设备指纹已存在 → 返回 dup（不覆盖，由客户端决定）
  let dup = false, existing = null;
  if (body.fp) {
    const list = await KV.list({ prefix: 'rec:' + project + ':' });
    for (const k of list.keys) {
      const v = await KV.get(k.name);
      if (!v) continue;
      try {
        const r = JSON.parse(v);
        if (r.fp && r.fp === body.fp && r.rid !== rid) { dup = true; existing = r; break; }
      } catch (e) {}
    }
  }
  if (!dup) {
    await KV.put(recKey(project, rid), JSON.stringify(body));
  }
  return json({ ok: true, dup: dup, existing: existing || null, record: dup ? null : body });
}

async function handleDelete(url) {
  const sp = url.searchParams;
  const project = sp.get('project');
  const rid = sp.get('rid');
  const clearProject = sp.get('clear') === '1';
  if (clearProject) {
    if (!project) return json({ ok: false, error: 'missing project' }, 400);
    const list = await KV.list({ prefix: 'rec:' + project + ':' });
    const del = list.keys.map(k => k.name);
    if (del.length) await KV.delete(del); // KV 批量删除
    return json({ ok: true, deleted: del.length });
  }
  if (!project || !rid) return json({ ok: false, error: 'missing project/rid' }, 400);
  await KV.delete(recKey(project, rid));
  return json({ ok: true });
}

async function handleRequest(request) {
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }
  if (request.method === 'GET' && url.pathname.endsWith('/api/records')) return handleGET(url);
  if (request.method === 'POST' && url.pathname.endsWith('/api/record')) return handlePost(request);
  if (request.method === 'DELETE' && url.pathname.endsWith('/api/record')) return handleDelete(url);
  if (request.method === 'DELETE' && url.pathname.endsWith('/api/project')) return handleDelete(url);
  return json({ ok: false, error: 'not found' }, 404);
}

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});
