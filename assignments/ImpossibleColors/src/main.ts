import './styles.css';
import { mountPicker } from './picker/controller';

const host=document.querySelector<HTMLElement>('#app')!;
mountPicker(host).then(app=>{
  if(import.meta.hot)import.meta.hot.dispose(()=>{void app.dispose();});
}).catch(error=>{
  host.replaceChildren();const message=document.createElement('p');
  message.className='startup-error';message.textContent=`The instrument could not start: ${error instanceof Error?error.message:String(error)}`;
  host.append(message);
});
