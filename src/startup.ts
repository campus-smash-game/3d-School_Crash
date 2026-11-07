export type StartupProgress = (message:string) => void;

/** 나눈 작업 사이에 브라우저가 화면 갱신과 입력을 처리할 시간을 준다. */
export function yieldToBrowser():Promise<void>{
  return new Promise(resolve=>{
    const channel=new MessageChannel();
    channel.port1.onmessage=()=>{channel.port1.close();channel.port2.close();resolve();};
    channel.port2.postMessage(null);
  });
}

export async function runStartupSteps<T>(steps:Generator<string,T,void>,onProgress:StartupProgress=()=>{}):Promise<T>{
  let deadline=performance.now();
  let previous='';
  try{
    while(true){
      const step=steps.next();
      if(step.done)return step.value;
      const changed=step.value!==previous;
      if(changed){previous=step.value;onProgress(step.value);}
      if(changed||performance.now()>=deadline){
        await yieldToBrowser();
        deadline=performance.now()+8;
      }
    }
  }finally{steps.return(undefined as T);}
}
