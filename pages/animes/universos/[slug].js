// No individual universes exist until explicitly curated in config/animes.js.
export default function AnimeUniverse(){return null;}
export function getServerSideProps(){return {notFound:true};}
