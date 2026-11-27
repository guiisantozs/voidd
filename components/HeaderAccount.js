import NotificationBell from './notifications/Notifications';
import Link from 'next/link';
import { useAccount } from './AccountProvider';
import { ProfileAvatar } from './profile/ProfileUI';
import { profileHref } from '../lib/usernames';

export default function HeaderAccount() {
  const { user, ownProfile } = useAccount();
  return <div className="header-account"><NotificationBell/><Link className="header-account-settings" href="/conta">Minha conta</Link>{user && <Link className="header-profile-link" href={ownProfile?.username ? profileHref(ownProfile) : '/perfil'} aria-label="Abrir meu perfil" title="Meu perfil"><ProfileAvatar profile={ownProfile || { display_name: 'Meu perfil' }} fallback="void" /></Link>}</div>;
}
