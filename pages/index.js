import Head from 'next/head';
import { useEffect, useState } from 'react';
import MovieHeader from '../components/movies/MovieHeader';
import HomeHero from '../components/home/HomeHero';
import HomeCatalog from '../components/home/HomeCatalog';
import { HomeFooter } from '../components/home/HomeWorlds';
import { categories } from '../lib/catalog';
import {publicCatalog} from '../lib/public-catalog-client.js';
import {useVisibleSection} from '../lib/use-visible-section';

export default function Home() {
  const [catalog, setCatalog] = useState({});
  const [catalogRef, catalogVisible] = useVisibleSection();
  async function load(key, signal) {
    const category = categories.find(item => item.key === key);
    if (!category) return;
    setCatalog(previous => ({ ...previous, [key]: { ...previous[key], loading: true, error: null } }));
    try {
      const data = await publicCatalog.request(key === 'filmes' ? '/api/filmes/weekly' : '/api/' + category.endpoint, { signal });
      if (!signal?.aborted) setCatalog(previous => ({ ...previous, [key]: { items: (key === 'filmes' ? data.movies || [] : data[key] || []).map(item => ({ ...item, categoria: key })), loading: false } }));
    } catch (error) {
      if (error.name !== 'AbortError') setCatalog(previous => ({ ...previous, [key]: { ...previous[key], error: error.message, loading: false } }));
    }
  }
  useEffect(() => {
    if (!catalogVisible) return;
    const controller = new AbortController();
    ['filmes', 'jogos'].forEach(key => load(key, controller.signal));
    return () => controller.abort();
  }, [catalogVisible]);
  return <div className="void-home-page"><Head><title>Void — seu universo em um só lugar</title><meta name="description" content="Explore filmes, jogos e universos. Guarde suas descobertas e compartilhe suas avaliações no Void."/></Head>
    <div className="home-navigation"><MovieHeader current="inicio" home/></div>
    <style jsx global>{`
      .home-navigation{height:0;position:relative;z-index:2;pointer-events:none}
      .home-navigation:after{content:'';position:absolute;inset:0 0 auto;height:64px;background:linear-gradient(180deg,#0d0b12,#0d0b1280 40%,#0d0b1200);pointer-events:none}
      .home-navigation .movie-site-header{display:none}
      .home-top-nav{gap:24px;animation:home-nav-enter .4s ease-out both}
      .account-bar .home-top-nav a{position:relative;transition:color .2s ease,transform .2s ease}
      .account-bar .home-top-nav a:after{content:'';position:absolute;left:0;right:0;bottom:3px;height:1px;border-radius:2px;background:#b69ade;transform:scaleX(0);transition:transform .2s ease}
      .account-bar .home-top-nav a:hover{transform:translateY(-1px)}
      .account-bar .home-top-nav a:hover:after,.account-bar .home-top-nav a:focus-visible:after{transform:scaleX(1)}
      .home-top-nav-soon{display:inline-flex;align-items:center;gap:5px;flex-shrink:0;min-height:34px;font-size:10px;color:#b5a6c4;cursor:default;white-space:nowrap}
      .home-top-nav-soon small{border:1px solid #b69ade38;background:#b69ade0c;color:#c9b1e0;border-radius:20px;padding:2px 5px;font-size:7px;line-height:1.3}
      @keyframes home-nav-enter{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
      @media(max-width:650px){.home-top-nav{justify-content:center;gap:22px}.home-top-nav-soon{flex-direction:column;justify-content:center;gap:2px;min-height:38px}}
      @media(prefers-reduced-motion:reduce){.home-top-nav{animation:none}.account-bar .home-top-nav a,.account-bar .home-top-nav a:after{transition:none}.account-bar .home-top-nav a:hover{transform:none}}
    `}</style>
    <main id="conteudo"><HomeHero/><div ref={catalogRef}><HomeCatalog catalog={catalog} load={load} enabled={catalogVisible}/></div></main><HomeFooter/>
  </div>;
}
