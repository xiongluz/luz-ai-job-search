package com.luz.aiagent.controller;


import com.luz.aiagent.LoginUtil.GQLDLogin;
import com.luz.aiagent.service.UserService;
import com.luz.aiagent.utils.Result;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@Slf4j
@Tag(name = "个人中心相关接口")
@RestController
@RequestMapping("/user")
public class UserController {

    @Autowired
    private UserService userService;

    @Operation(summary = "岗位收藏/取消收藏")
    @GetMapping("/favorite")
    @GQLDLogin
    public Result<String> favorite(@RequestParam Long positionId,
                                   @RequestParam Long status) {
        userService.favorite(positionId, status);
        return Result.ok("操作成功");

    }


}
