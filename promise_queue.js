const { EventEmitter } = require("events");

class PromiseQueue extends EventEmitter {
    constructor(concurrency) {
        super();
        this.concurrency = concurrency; // 最大并发数
        this.queue = []; // 任务队列
        this.activeCount = 0; // 当前正在执行的任务数
    }
  
    add(task) {
      return new Promise((resolve, reject) => {
            this.queue.push({ task, resolve, reject });
            this._next();
      });
    }
  
    _next() {
		if (this.activeCount >= this.concurrency || this.queue.length === 0) {
			return;
		}
	
		const { task, resolve, reject } = this.queue.shift();
		this.activeCount++;
	
		task()
            .finally(() => {
                this.activeCount--;
                this._next();
                console.log(this.activeCount, this.queue.length)
                if (this.activeCount === 0 && this.queue.length === 0) {
                    this.emit('finish'); // 触发 finish 事件
                }
            })
            .then(resolve)
            .catch(reject)
    }
  }


  class PromisePool extends EventEmitter {
    constructor(maxConcurrency) {
        super();
        this.maxConcurrency = maxConcurrency;
        this.tasks = [];
        this.running = [];
    }
  
    add(task) {
        return new Promise((resolve, reject) => {
            this.tasks.push({ task, resolve, reject });
            this.execute();
        });
    }
  
    execute() {
      while (this.running.length < this.maxConcurrency && this.tasks.length > 0) {
        const { task, resolve, reject } = this.tasks.shift();
        const p = task();
        this.running.push(p);
        p.then(() => {
            resolve();
            this.running.splice(this.running.indexOf(p), 1);
            this.execute();
        }).catch((err) => {
            reject(err);
            this.running.splice(this.running.indexOf(p), 1);
            this.execute();
        });
      }
      this.checkFinish();
    }
  
    checkFinish() {
      if (this.tasks.length === 0 && this.running.length === 0) {
            this.emit('finish');
      }
    }
  }
  

module.exports = { PromiseQueue, PromisePool };