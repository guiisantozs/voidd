import {isIP} from 'node:net';
import {createSearchLimiter} from './provider-guard.js';
import {resourceMetrics} from './resource-metrics.js';

const configured=Number(process.env.VOID_SEARCH_REQUESTS_PER_MINUTE);
const allow=createSearchLimiter({limit:Number.isInteger(configured)&&configured>0?configured:90});
export function allowCatalogSearch(req,res) {
  // Only Vercel's trusted proxy header is accepted on Vercel. Arbitrary incoming
  // X-Forwarded-For cannot bypass the direct-server limit.
  const forwarded=process.env.VERCEL==='1'?req.headers?.['x-vercel-forwarded-for']:null;
  const ip=typeof forwarded==='string'&&isIP(forwarded.trim())?forwarded.trim():req.socket?.remoteAddress||'unknown';
  const retry=allow(ip);
  if (!retry) return true;
  resourceMetrics.record('catalog:search','limited');
  res.setHeader('Cache-Control','no-store'); res.setHeader('Retry-After',String(retry));
  res.status(429).json({erro:'Muitas pesquisas em pouco tempo. Aguarde alguns instantes.'}); return false;
}
export function consumptionFailure(error,res) {
  if (!error?.consumptionLimited && error?.status!==429) return null;
  res.setHeader('Cache-Control','no-store'); res.setHeader('Retry-After',String(error.retryAfter||60));
  return error.status===503?503:429;
}
