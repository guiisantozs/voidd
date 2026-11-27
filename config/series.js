export const SERIES_RULES={excludeAnime:true,cacheMs:3600000,heroCount:5,rowCount:18,recommendationMinimum:3,positiveRating:4,acclaimed:{rating:8,minVotes:1000},
 seasons:{windows:[6,9,12],target:12,minRating:7.3,minVotes:1000,recognizedVotes:2500,minPopularity:15,candidatePages:3,minSeason:2},
 essentials:{minRating:7.8,minVotes:1000},communityDays:7,communityMaxPages:40,communityHistoryPages:5};
// Editorial identities only. Names, artwork, ratings and availability always come from TMDB.
export const essentialSeriesIds=[1396,1399,60059,1398,1438,66732,70523,87108,60574,100088,76331,2316,19885,46648,95396,67070];
// TV genre IDs supplied by TMDB. Horror, thriller and romance are keyword selections,
// not invented TV genre IDs; their IDs are resolved through TMDB's keyword search.
export const seriesGenres=[
 {key:'drama',title:'Drama',genre:18,icon:'heart'},
 {key:'comedy',title:'Comédia',genre:35,icon:'sparkle'},
 {key:'action',title:'Ação e Aventura',genre:10759,icon:'arrow-up-right'},
 {key:'scifi',title:'Ficção científica e Fantasia',genre:10765,icon:'sparkle'},
 {key:'crime',title:'Crime e Mistério',genres:'80|9648',icon:'search'},
 {key:'horror',title:'Terror',keyword:'horror',icon:'moon'},
 {key:'thriller',title:'Suspense',keyword:'thriller',icon:'clock'},
 {key:'romance',title:'Romance',keyword:'romance',icon:'heart'},
 {key:'documentary',title:'Documentário',genre:99,icon:'film'},
 {key:'family',title:'Para toda a família',genre:10751,icon:'users'},
 {key:'politics',title:'Guerra e Política',genre:10768,icon:'contrast'},
];
export const seriesGenreNames={16:'Animação',18:'Drama',35:'Comédia',80:'Crime',99:'Documentário',9648:'Mistério',10751:'Família',10759:'Ação e Aventura',10762:'Infantil',10763:'Notícias',10764:'Reality',10765:'Ficção científica e Fantasia',10766:'Novela',10767:'Talk show',10768:'Guerra e Política'};
