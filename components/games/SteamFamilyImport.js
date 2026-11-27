import { useRef } from 'react';
import Icon from '../Icon';
import { extractFamilyAuthorization } from '../../lib/game-collection-client';

export default function SteamFamilyImport({ busy, error, progress, onImport, onError }) {
 const dialog = useRef(null), authorization = useRef(null);
 function clear() { if (authorization.current) authorization.current.value = ''; }
 function open() { onError(''); clear(); dialog.current?.showModal(); }
 function close() { clear(); dialog.current?.close(); }
 async function submit(event) {
  event.preventDefault();
  if (busy) return;
  let token = extractFamilyAuthorization(authorization.current?.value);
  clear();
  if (!token) { onError('Copie a resposta da página Steam ou o valor completo de webapi_token.'); authorization.current?.focus(); return; }
  try { if (await onImport(token)) close(); }
  finally { token = null; }
 }
 return <div className="gc-family-import">
  <button className="game-button-outline" disabled={busy} onClick={open} title="Importar seus jogos compartilhados da Steam"><Icon name="refresh"/>Sincronizar família</button>
  <dialog ref={dialog} className="gc-family-dialog" aria-labelledby="steam-family-title" onClose={clear} onCancel={clear}>
   <header><div><p className="gc-eyebrow">SINCRONIZAÇÃO EM LOTE</p><h2 id="steam-family-title">Conectar sua família Steam</h2></div><button type="button" onClick={close} aria-label="Fechar importação da família"><Icon name="close"/></button></header>
   <ol>
    <li><strong>Abra a sua Steam</strong><p>Use a mesma conta Steam conectada ao VOID.</p><a className="game-button-outline" href="https://store.steampowered.com/pointssummary/ajaxgetasyncconfig" target="_blank" rel="noopener noreferrer">Abrir autorização na Steam <Icon name="arrow-up-right"/></a></li>
    <li><strong>Copie a resposta da página</strong><p>Copie todo o texto exibido. O VOID identifica a autorização automaticamente.</p></li>
    <li><strong>Cole abaixo e importe seus jogos</strong><p>Você faz isso uma vez para o lote inteiro, sem escolher cada jogo.</p></li>
   </ol>
   <form onSubmit={submit}>
    <label htmlFor="steam-family-authorization">Autorização temporária da Steam</label>
    <input ref={authorization} id="steam-family-authorization" type="password" autoComplete="off" spellCheck={false} maxLength={16000} placeholder="Cole a resposta da Steam aqui" required disabled={busy} aria-describedby="steam-family-privacy"/>
    <p id="steam-family-privacy">A autorização é usada somente nesta consulta e não é salva. Sua senha Steam não é solicitada. Apenas os jogos com atividade na sua conta entram na coleção.</p>
    {error && <p className="gc-error" role="alert">{error}</p>}
    {busy && <p role="status">{progress ? `Importando: ${progress.position} de ${progress.total} jogos.` : 'Verificando sua conta e a atividade da família…'}</p>}
    <footer><button type="button" className="game-button-outline" onClick={close}>Fechar</button><button type="submit" className="game-button" disabled={busy}>{busy ? 'Importando…' : 'Importar para minha coleção'}</button></footer>
   </form>
   <small>Os jogos importados ficam na sua coleção. Para atualizar a atividade compartilhada, você pode repetir esta sincronização com uma nova autorização.</small>
  </dialog>
 </div>;
}
