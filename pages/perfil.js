import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAccount } from '../components/AccountProvider';
import { profileHref } from '../lib/usernames';
export default function OwnProfile(){const {user,ready,client}=useAccount();const router=useRouter();useEffect(()=>{if(!ready)return;if(!user){router.replace('/conta');return;}let active=true;client.rpc('void_username_self').then(({data})=>{if(active)router.replace(profileHref({user_id:user.id,username:data?.username}));}).catch(()=>{if(active)router.replace(`/pessoas/${user.id}`);});return()=>{active=false;};},[ready,user?.id,client,router]);return <main className="review-page"><p role="status">Abrindo seu perfil…</p><Link href="/conta">Ir para minha conta</Link></main>;}
