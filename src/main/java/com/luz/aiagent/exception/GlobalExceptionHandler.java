package com.luz.aiagent.exception;

import com.luz.aiagent.utils.GQLDException;
import com.luz.aiagent.utils.Result;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@Slf4j
@RestControllerAdvice//定义这个是全家异常处理器
public class GlobalExceptionHandler {
    /*
     * 默认全局异常处理。
     * @param e the e
     * @return ResultData

     */
    @ExceptionHandler(GQLDException.class)//捕获运行时异常信息
    /*@ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)*/ //这段代码会将错误响应值固定为500
    public Result<String> exception(GQLDException e) {
        log.error("业务异常：code={}, message={}", e.getCode(), e.getMessage());
        return Result.fail(e.getCode(), e.getMessage());
    }
}
