import { useEffect, useId, useState } from 'react';
import { useAccount } from '../AccountProvider';
export const NAME_MESSAGE = 'Este nome não pode ser utilizado. Escolha outro nome para continuar.';

export default function DisplayNameField({ value, onChange, onStatus, disabled = false, inputRef, id: providedId }) {
  const { client } = useAccount(), generatedId = useId(), id = providedId || generatedId;
  const [state, setState] = useState({});
  const status = !value?.trim() ? 'empty' : state.value === value ? state.status : 'checking';
  useEffect(() => { onStatus?.(status); }, [status, onStatus]);
  useEffect(() => {
    if (!client || !value?.trim()) return;
    const abort = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const { data, error } = await client.rpc('void_name_check', { value }).abortSignal(abort.signal);
        if (error) throw error;
        if (!abort.signal.aborted) setState({ value, status: data ? 'allowed' : 'prohibited' });
      } catch { if (!abort.signal.aborted) setState({ value, status: 'error' }); }
    }, 350);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [client, value]);
  return <label htmlFor={id}>Nome de exibição<input ref={inputRef} id={id} aria-label="Nome de exibição" required maxLength={50} value={value} disabled={disabled} autoComplete="nickname" onChange={event => onChange(event.target.value)} aria-invalid={status === 'prohibited' || undefined} aria-describedby={`${id}-status`} /><small id={`${id}-status`} role="status">{status === 'prohibited' ? NAME_MESSAGE : status === 'checking' ? 'Verificando nome…' : status === 'error' ? 'Não foi possível verificar o nome. A validação será feita ao salvar.' : ''}</small></label>;
}
