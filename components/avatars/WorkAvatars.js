import AvatarPicker from './AvatarPicker';
import { workHref } from '../../lib/work-client';
export default function WorkAvatars({ item, catalog }) { return <AvatarPicker catalog={catalog} returnHref={`${workHref(item)}?tab=avatares`} />; }
