import Icon from '../Icon';
import {useState} from 'react';
import {useMovieList} from '../movies/MovieUI';
import {ListPicker as Picker,ListPickerDialog} from './ListPicker';

export function ListPicker({item}){const watchlist=useMovieList();return <Picker item={item} watchlist={watchlist}/>;}
export default function AddToList({item,label='Adicionar a uma lista'}){
 const [open,setOpen]=useState(false),watchlist=useMovieList();
 return <><button type="button" className="vl-add-work" aria-label={typeof label==='string'?label:undefined} aria-haspopup="dialog" aria-expanded={open} onClick={()=>setOpen(true)}><Icon name="plus"/> <span className="vl-add-work-label">{label}</span></button>{open&&<ListPickerDialog item={item} watchlist={watchlist} onClose={()=>setOpen(false)}/>}</>;
}
