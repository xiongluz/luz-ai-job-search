package com.luz.aiagent.LoginUtil;

import java.lang.annotation.*;

/**
 * 认证自定义注解
 * 设计属性：要求是否必须登录属性（true：要求必须登录）
 * 元注解：
 * @Target：注解使用位置：指定方法上，类（接口），属性，构造器，构造器参数
 * @Retention：注解生命周期 例如设置为class 运行时，注解失效    所以一般设置为runtime，在运行时有效
 * @Inherited：该注解是否可以继承
 * @Documented：javadoc命令是否生成文档*/
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
@Inherited
@Documented
public @interface GQLDLogin {

    //是否要求用户必须登录:设置默认为必须登录
    boolean required() default true;
}
