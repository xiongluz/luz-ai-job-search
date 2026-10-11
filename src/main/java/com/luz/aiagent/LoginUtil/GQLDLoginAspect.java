package com.luz.aiagent.LoginUtil;

import com.luz.aiagent.user.login.UserAccount;
import com.luz.aiagent.utils.AuthContextHolder;
import com.luz.aiagent.utils.Constant;
import com.luz.aiagent.utils.GQLDException;
import com.luz.aiagent.utils.ResultCodeEnum;
import jakarta.servlet.http.HttpServletRequest;
import lombok.SneakyThrows;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;


/**
 * 认证校验的切面类（AOP）
 * 对自定义注解@TSLogin修饰方式进行增强，获取用户登录id*/
@Aspect //声明切面类
@Component //将切面类注入到ioc中
@Slf4j
public class GQLDLoginAspect {
    //环绕通知，效果更强
    //* com.atguigu.tingshu.*.api.*.*(..)表示是在api包下任意子包，子包下任意接口下任意方法
    /**
     * @Param pjp(切入类方法对象） ProceedingJoinPoint类型，表示切点，封装了方法信息
     * @Param tsLogin(自定义注解) TSLogin类型，表示自定义注解
     */
    @Autowired
    private RedisTemplate redisTemplate;

    @SneakyThrows //自动对方法体try catch
    @Around("execution(* com.luz.aiagent.controller.*.*(..)) && @annotation(gqldLogin)")
    public Object soundLoginAspect(ProceedingJoinPoint pjp, GQLDLogin gqldLogin) {
        Object object = new Object();
        //1.尝试从请求对象中获取用户token
        RequestAttributes requestAttributes = RequestContextHolder.getRequestAttributes();
        //RequestAttributes是接口  ServletRequestAttributes是接口实现类
        ServletRequestAttributes sra = (ServletRequestAttributes) requestAttributes;

        HttpServletRequest request = sra.getRequest();

        //2.根据token获取用户信息（用户id，用户昵称）
        //2.1获取用户token  前端传来的
        String token = request.getHeader("token");
        //2.2拼接用户登录时存入redis中的key
        String loginKey = Constant.USER_LOGIN_KEY_PREFIX + token;
        //2.3根据key从redis中获取用户信息
        UserAccount userAccount = (UserAccount) redisTemplate.opsForValue().get(loginKey);

        if (gqldLogin.required()){
            //用户必须登录，如果用户信息为空，抛出异常如果此时用户信息为空抛出异常，小程序员引导用户进行登录
            if (userAccount == null){
                throw new GQLDException(ResultCodeEnum.LOGIN_AUTH);
            }
        }

        //3.将用户信息隐式注入
        if (userAccount != null){
            //用户登录成功,将信息存入ThreadLocal中
            AuthContextHolder.setUserId(userAccount.id());
            AuthContextHolder.setUsername(userAccount.nickname());
        }

        //执行目标方法
        object = pjp.proceed();

        //4.避免ThreadLocal导致的内容泄露导致的oom问题，因此需要手动清理
        AuthContextHolder.removeUserId();
        AuthContextHolder.removeUsername();
        //删除后，value为空，key为弱引用，会触发垃圾回收，自动删除
        return object;

    }


}
