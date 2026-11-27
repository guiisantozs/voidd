export const animeSeasonUnit=work=>({seriesId:Number(work.id),seasonNumber:1,episodeNumber:0,name:work.displayTitle||work.titulo,airDate:work.estreia,poster:work.poster,episodeCount:work.numberOfEpisodes||0,sourceDefined:true});
export function nextAnimeBroadcast(item,now=new Date()){
 if(item.releaseStatus!=='Returning Series'||!['JST','Asia/Tokyo'].includes(item.broadcast?.timezone))return null;
 const days={Sundays:0,Mondays:1,Tuesdays:2,Wednesdays:3,Thursdays:4,Fridays:5,Saturdays:6},day=days[item.broadcast.day],time=item.broadcast.time?.match(/^(\d{2}):(\d{2})$/);if(day===undefined||!time||Number(time[1])>23||Number(time[2])>59)return null;
 const japan=new Date(now.getTime()+9*3600000),delta=(day-japan.getUTCDay()+7)%7;let date=Date.UTC(japan.getUTCFullYear(),japan.getUTCMonth(),japan.getUTCDate()+delta,Number(time[1])-9,Number(time[2]));if(date<=now.getTime())date+=7*86400000;return {date:new Date(date).toISOString(),days:Math.ceil((date-now.getTime())/86400000)};
}
