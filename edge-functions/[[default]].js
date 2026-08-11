// cdn-edge-gateway — EdgeOne Makers 边缘函数薄壳
//
// 对齐 2026 官方 Makers 范式（目录 ./edge-functions/、Catch-all 文件名 [[default]].js）。
// 本文件不承载任何业务逻辑，仅把请求转发给打包产物 _worker.js，
// 由它内部的 onRequest(context) 统一处理数据面代理与 /__panel/api/* 管理面。
//
// 为什么全部动态请求收口在 Edge Functions（而非分流给 cloud-functions）：
//   本项目配置存储只用 KV（站点/源站池/规则全部存 KV），而官方明确：
//     「EdgeOne Makers KV 当前仅支持在 Edge Functions 中使用」。
//   数据面代理 handleProxy 必须与 /__panel/api/* 一样读 KV 才能拿到站点与源站配置，
//   因此 Cloud Functions（云端 Node）拿不到 CDN_KV，无法承载任何需要配置的请求。
//   在「KV-only」现状下，全站动态请求都必须在 Edge Functions 跑通——这是硬约束，不是取舍。
//
// Cloud Functions 的预留角色（见同仓 cloud-functions/README.md）：
//   承载「不依赖 KV 的重活」——大数据转码、AI 推理、独立 MySQL/Blob 业务、后台批处理等。
//   一旦引入这类场景，应在 cloud-functions/ 下新增路由，而非塞进本 Edge 入口。
//   跨平台存储统一策略：CF 侧未来用 D1、EO 侧对应用 Blob（对象存储，cloud-functions 经 SDK 访问），
//   两者封装在同一存储抽象层之后，调用方无感知（详见 docs/10-architecture.md 的「存储抽象」章节）。
//
// 静态资源（dist/public/ 下的 index.html、assets/*）由 Makers 自动托管，
// 与函数路由冲突时静态资源优先，无需在 edgeone.json 里写 routes。
//
// 参考：Tencent Cloud EdgeOne Makers 文档（Functions > 概览 / Cloud Functions > Node.js）

// 复用同一打包产物：CF Workers / EO Edge Function 共用。
// _worker.js 已原生 export async function onRequest(context)，故直接透传。
export { onRequest } from '../_worker.js';
