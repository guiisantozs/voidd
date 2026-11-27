import AvatarPicker from './AvatarPicker';
import { useAvatars } from '../../lib/use-avatars';
export default function ProfileAvatars({ onSaved }) { const catalog = useAvatars(); return <AvatarPicker catalog={catalog} grouped onSaved={onSaved} />; }
