import Link from 'next/link';
import { ProfileAvatar } from '../profile/ProfileUI';
import { profileHref } from '../../lib/usernames';
import { profileIdValid } from '../../lib/profile';

export default function ListParticipantLink({ person, avatarOnly = false, children }) {
 const name = person.display_name || 'Pessoa do VOID';
 const content = <><ProfileAvatar profile={person}/>{!avatarOnly&&<span><strong>{name}</strong>{children}</span>}</>;
 const className = `vc-participant-link${avatarOnly ? ' vc-avatar-link' : ''}`;
 return profileIdValid(person.user_id)
  ? <Link href={profileHref(person.user_id)} className={className} aria-label={avatarOnly ? `Ver perfil de ${name}` : undefined}>{content}</Link>
  : <span className={className}>{content}</span>;
}
