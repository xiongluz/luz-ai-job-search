package com.luz.aiagent.utils;

import lombok.Data;

import java.io.Serializable;
import java.util.List;

@Data
public class PageResult<T> implements Serializable {
    // 当前页数据
    private List<T> list;

    // 总条数
    private long total;

    // 当前页
    private int pageNum;

    // 每页大小
    private int pageSize;

    // 总页数
    private int pages;

    // 是否有下一页
    private boolean hasNext;

    // 是否有上一页
    private boolean hasPrevious;

    // ================== 静态构造方法 ==================

    public static <T> PageResult<T> build(List<T> list, long total, int pageNum, int pageSize) {
        PageResult<T> result = new PageResult<>();
        result.setList(list);
        result.setTotal(total);
        result.setPageNum(pageNum);
        result.setPageSize(pageSize);

        // 计算总页数
        int pages = (int) Math.ceil((double) total / pageSize);
        result.setPages(pages);

        // 是否有下一页
        result.setHasNext(pageNum < pages);

        // 是否有上一页
        result.setHasPrevious(pageNum > 1);

        return result;
    }
}
