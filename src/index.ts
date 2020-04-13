import App from './App';

const canvas = document.getElementById('renderCanvas');
const enterXRButton = document.getElementById('startXRButton');

document.body.classList.add('loaded');
new App(canvas, enterXRButton).run();