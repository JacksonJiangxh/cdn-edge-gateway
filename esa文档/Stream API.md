Stream API是一种处理流式数据的方法。通过Stream API，您可以在边缘节点上处理流式数据，例如音频和视频。Stream API可以将流式数据分块传输，提高数据传输效率。

## ReadableStream

-   定义：ReadableStream的定义，请参见MDN官方文档[ReadableStream.ReadableStream()](https://developer.mozilla.org/zh-CN/docs/Web/API/ReadableStream/ReadableStream)。
    
-   未实现的方法：constructor未实现。
    

**说明**

同一时间只有一个reader可以被lock，这和标准一致。

## ReadableStreamDefaultReader

-   定义：ReadableStreamDefaultReader的定义，请参见MDN官方文档[ReadableStreamDefaultReader](https://developer.mozilla.org/zh-CN/docs/Web/API/ReadableStreamDefaultReader)。
    
-   未实现的方法：constructor不能使用。
    

## WritableStream

定义：WritableStream的定义，请参见MDN官方文档[WritableStream](https://developer.mozilla.org/zh-CN/docs/Web/API/WritableStream)。

## WritableStreamDefaultWriter

-   定义：WritableStreamDefaultWriter的定义，请参见MDN官方文档[WritableStreamDefaultWriter](https://developer.mozilla.org/zh-CN/docs/Web/API/WritableStreamDefaultWriter)。
    
-   未实现的方法：
    
    -   constructor不能使用。
        
    -   desiredSize和ready未实现。
        

## TransformStream

TransformStream的定义，请参见MDN官方文档[TransformStream](https://developer.mozilla.org/zh-CN/docs/Web/API/TransformStream)。

**说明**

TransformStream中的pipe函数可以同时处理请求及回复请求，但pipe内部有缓冲区大小，当您使用异步API时需注意防止死锁。