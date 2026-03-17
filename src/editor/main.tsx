import { render } from 'preact';
import { EditorApp } from './EditorApp';
import './styles.css';

const root = document.getElementById('app');

if (!root) {
  throw new Error('Editor root element was not found');
}

render(<EditorApp />, root);
