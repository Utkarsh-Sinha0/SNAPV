import { render } from 'preact';
import { PopupApp } from './PopupApp';
import './styles.css';

const root = document.getElementById('app');

if (!root) {
  throw new Error('Popup root element was not found');
}

render(<PopupApp />, root);
