package main

import (
	"bufio"
	"fmt"
	"os"
	"strconv"
	"strings"
)

type BillRecord struct {
	Category1   string
	Category2   string
	Tags        []string
	Number      string
	Description string
}

func main() {
	filepath := `/Users/linjiasen/personal/life-management/02.内容管理/1000.日常生活/1200.财务状况/1210.日常账单/2023/03月.md`

	file, err := os.Open(filepath)
	if err != nil {
		panic(err)
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)

	readDataStatus := 0

	dateMap := make(map[string][]BillRecord)
	dateRecordList := make([]BillRecord, 0)
	dateStr := ""

	for scanner.Scan() {
		lineStr := scanner.Text()
		lineStr = strings.TrimSpace(lineStr)
		if len(lineStr) == 0 {
			continue
		}

		if strings.Index(lineStr, "## 1. 日常收支") == 0 {
			fmt.Println("开始读取本月收支情况 [[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[ ")
			readDataStatus = 1
			continue
		} else if strings.Index(lineStr, "## 2. 收支汇总") == 0 {
			fmt.Println("结束读取本月收支情况 ]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]] ")
			readDataStatus = 0
			break
		}

		if readDataStatus == 1 {
			dateSectionTag := "### "

			if strings.Index(lineStr, dateSectionTag) == 0 {
				dateStr = strings.Replace(lineStr, dateSectionTag, "", 1)
				dateMap[dateStr] = make([]BillRecord, 0)
				continue
			}
			dateRecordList, _ = dateMap[dateStr]
			dateMap[dateStr] = readDateData(dateRecordList, lineStr, dateStr)
		}
	}

	// output parse data
	totalOut := 0.0
	totalIn := 0.0

	outMap := make(map[string]float64)
	inMap := make(map[string]float64)

	for _, recordList := range dateMap {
		for _, recordItem := range recordList {
			v, err := strconv.ParseFloat(strings.TrimSpace(recordItem.Number), 64)
			if err != nil {
				panic(err)
			}

			category1 := strings.TrimSpace(recordItem.Category1)
			category2 := strings.TrimSpace(recordItem.Category2)

			switch category1 {
			case "支出":
				totalOut += v
				prev, ok := outMap[category2]
				if !ok {
					outMap[category2] = v
				} else {
					outMap[category2] = prev + v
				}
			case "收入":
				totalIn += v
				prev, ok := inMap[category2]
				if !ok {
					inMap[category2] = v
				} else {
					inMap[category2] = prev + v
				}
			}
		}
		// fmt.Printf("===========\n")
	}
	fmt.Printf("===========\n")
	fmt.Printf("收支汇总: %.2f\n", totalIn-totalOut)
	fmt.Printf("-----------\n")
	fmt.Printf("支出汇总: %.2f\n", totalOut)
	for key, val := range outMap {
		fmt.Printf("| %s | %.2f |\n", key, val)
	}
	fmt.Printf("-----------\n")
	fmt.Printf("收入汇总: %.2f\n", totalIn)
	for key, val := range inMap {
		fmt.Printf("| %s | %.2f |\n", key, val)
	}
	fmt.Printf("-----------\n")
}

func readDateData(recordList []BillRecord, lineStr, dataStr string) []BillRecord {
	if strings.Index(lineStr, "分类 1") != -1 || strings.Index(lineStr, ":----:") != -1 {
		return recordList
	}
	dataParams := strings.Split(lineStr, "|")
	record := BillRecord{
		Category1:   dataParams[1],
		Category2:   dataParams[2],
		Tags:        strings.Split(dataParams[3], "、"),
		Number:      dataParams[4],
		Description: dataParams[5],
	}
	recordList = append(recordList, record)
	return recordList
}
