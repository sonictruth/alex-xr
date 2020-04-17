import App from './App';

const canvas = document.getElementById('renderCanvas');
const enterXRButton = document.getElementById('startXRButton');

new App(canvas, enterXRButton ).run();