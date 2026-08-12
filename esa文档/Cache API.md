Cache API是一种缓存数据的方法。通过Cache API，您可以在边缘节点上缓存数据，以便在下次请求时快速返回数据。Cache API可以设置缓存时间和缓存大小，以便更好地控制缓存策略。

## 工作原理

通过ER内置的CacheAPI，您可以将ER处理后的结果或从源站获取的数据缓存到ESA，供其他访问到同节点的请求复⽤，以减少重复的计算或⽹络请求。ER和ESA缓存的关系示意图如下：![工作原理](https://help-static-aliyun-doc.aliyuncs.com/assets/img/zh-CN/5938813461/p296475.png)

## API标准

Cache基本尽可能地遵循标准 [Cache](https://developer.mozilla.org/zh-CN/docs/Web/API/Cache)。但由于边缘程序是复用ESA已有的Cache引擎，所以最终语意尚无法做到完全一致。

## API定义

**cache.put(request/string, response)**

-   将一个Response对象，缓存到Cache中。
    
    -   如果put成功，resolve成undefined。
        
    -   如果由于Cache引擎失败，reject成error异常。
        
    -   如果由于Cache引擎的quota超用，reject成error异常。
        
-   缓存的key设置为 request对象的URL 或者直接用string表示URL。（请使用HTTP协议的URL，目前由于ESA Cache引擎的原因不支持设置HTTPS协议的URL）。
    
-   这个是个异步函数，可调用await确保put完成，await用法请参考[await语法](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Operators/await)。
    
-   Response对象可以设置cache-control头用于配置Cache的TTL（cache-control头设置符合Cache标准）。
    

**示例**

-   存储内容到Cache。
    
    ```
    async function doPut() {
      await cache.put("http://www.example.com", new Response("Hello World"));
      new Response("Hello World", {headers: [["cache-control", "max-age=10"]]})); 
    }
    ```
    
-   存储内容到Cache并且设置ttl。
    
    ```
    async function doPut() {
      await cache.put("http://www.example.com", new Response("Hello World"));
      await cache.put("http://www.example.com", 
      new Response("Hello World", {headers: [["cache-control", "max-age=10"]]})); 
    }
    ```
    

**cache.get(request/string)**

-   获得一个key为输入request/string的Response对象（如果对象不存在，resolve成undefined）。
    
-   这个是个异步函数，可调用await确保get完成。
    
-   get有可能无法返回刚刚put的对象，因为缓存的LRU算法，Cache不保证一定可以取到。
    

**示例**

-   cache.get获得一个Response对象。
    
    ```
    async function doGet() {
        let resp = await cache.get("http://www.example.com");
    }
    ```
    
-   存储的结果解析成JSON。
    
    ```
    async function doGet() {
        let resp = await cache.get("http://www.example.com");
        let j = await resp.json();
    }
    ```
    

**cache.delete(request/string)**

-   删除一个key为输入的Response对象。
    
    -   如果删除成功，resolve成true。
        
    -   如果删除失败，则resolve成false。
        
-   这个是个异步函数，调用await确保delete完成。
    

**示例（删除key下的资源）**

```
async function doDelete() {
  let resp = await cache.delete("http://www.example.com");
  
  if (resp) {
        console.alert("done");
  } else {
        console.alert("failed");
  }
}
```

## 使用限制

-   以上所有的请求都是子请求，所以共享ER子请求个数的限制。默认一个ER请求的fetch子请求最多不超过32个（这个数字可能将在ER商业化时发生变化）。由于Cache的所有API操作也是子请求，所以他们和fetch共享32个子请求的约束，即cache.put+cache.get+cache.delete+fetch在一个Request上下文中不能超过32个。
    
-   cache.put、cache.get和cache.delete都有concurrency control，即针对同一个URL，某个请求在get，另外一个请求在delete的时候，get或者delete有可能返回pending状态，即该请求目前无法完成（多个并发请求都在同时修改同一个key下的资源导致），建议稍等后重试。
    
    **说明**
    
    cache.put、cache.get和cache.delete reject成true时，表示该操作被concurrency control。
    

## 缓存刷新

通过CacheAPI存入的缓存暂不支持主动刷新，您需要在`Cache.put()`存入缓存时通过TTL参数指定合适的缓存时间。