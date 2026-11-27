import NextImage from 'next/image.js';

// This Pages Router project uses native ESM. next/image is CommonJS and its
// default export can arrive wrapped once more by the client/server bundlers.
const Image=NextImage.default||NextImage;
export default Image;
