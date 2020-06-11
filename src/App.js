import React, {Component} from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import {
    Container, Navbar, Row, Col, Button, Tooltip, OverlayTrigger, Form
} from 'react-bootstrap'
import {
    Document, Packer, Paragraph, TextRun, HeadingLevel
} from "docx";
import {saveAs} from "file-saver"
import MomentLocaleUtils, {formatDate, parseDate} from 'react-day-picker/moment';
import DayPickerInput from "react-day-picker/DayPickerInput";
import "./MyComponents/date_unput.css"
import "react-day-picker/lib/style.css";
import './App.css';
import moment from "moment";
import 'moment/locale/ru'
import {Helmet} from 'react-helmet'
import Select from "react-dropdown-select";
import BootstrapTable from 'react-bootstrap-table-next';
import filterFactory, {
    dateFilter, numberFilter, textFilter, selectFilter
} from 'react-bootstrap-table2-filter';
import paginationFactory from 'react-bootstrap-table2-paginator';
import DoubleScrollbar from 'react-double-scrollbar'
import createPlotlyComponent from 'react-plotly.js/factory';
import {CSVLink} from "react-csv";

const Plotly = window.Plotly;
const Plot = createPlotlyComponent(Plotly);
const version = '1.0.0'
const LOCALHOST = "http://127.0.0.1:5000"
const WEBSERVER = "https://kozinov.azurewebsites.net"

const sizePerPageRenderer = ({
                                 options,
                                 currSizePerPage,
                                 onSizePerPageChange
                             }) => (
    <div className="btn-group" role="group">
        {
            options.map((option) => {
                const isSelect = currSizePerPage === `${option.page}`;
                return (
                    <button
                        key={option.text}
                        type="button"
                        onClick={() => onSizePerPageChange(option.page)}
                        className={`btn ${isSelect ? 'btn-secondary' : 'btn-warning'}`}
                    >
                        {option.text}
                    </button>
                );
            })}
    </div>
);


const expandRow = {
    onlyOneExpanding: true,
    renderer: row => (
        <div>
            <p>Полный текст:</p>
            <p>{row.text}...</p>
        </div>
    )
};

function prepareDataForChart(data, groups) {
    let posts_by_group = {}
    groups.map(group => {
        posts_by_group[group] = data.filter(post => {
            return post.group_name === group
        })
        return group
    })
    let metrics = []
    for (let [group, timeArray] of Object.entries(posts_by_group)) {
        let object = {}
        timeArray.map(function (post) {
            let date = post.post_date;
            let localDateString = new Date(date).getFullYear() + '-' + (new Date(date).getMonth() + 1) + '-' + new Date(date).getDate();
            if (object[localDateString]) {
                object[localDateString].count += 1;
                object[localDateString].views += post.views;
            } else {
                object[localDateString] = {views: post.views, count: 1}
            }
            return post
        })

        let x = []
        let y = []
        for (let [key, value] of Object.entries(object)) {
            x.push(new Date(key))
            y.push(parseInt(value.views / value.count))
        }
        metrics.push({"name": group, "x": x, "y": y, "type": 'scatter', "line": {"shape": 'spline'}})
    }
    return metrics
}

function makeDocxData(data) {
    let docx_data = {
        most_view: {count: 0},
        most_repost: {count: 0},
        most_like: {count: 0},
        most_comment: {count: 0},
        positives: 0,
        negatives: 0,
        neutrals: 0
    }
    data.map(post => {
        if (docx_data.most_view.count < post.views) {
            docx_data.most_view.count = post.views
            docx_data.most_view['text'] = post.text.slice(0, 20) + "..."
            docx_data.most_view['link'] = post.post_link
            docx_data.most_view['group'] = post.group_name
        }
        if (docx_data.most_comment.count < post.comments) {
            docx_data.most_comment.count = post.comments
            docx_data.most_comment['text'] = post.text.slice(0, 20) + "..."
            docx_data.most_comment['link'] = post.post_link
            docx_data.most_comment['group'] = post.group_name
        }
        if (docx_data.most_like.count < post.likes) {
            docx_data.most_like.count = post.likes
            docx_data.most_like['text'] = post.text.slice(0, 20) + "..."
            docx_data.most_like['link'] = post.post_link
            docx_data.most_like['group'] = post.group_name
        }
        if (docx_data.most_repost.count < post.reposts) {
            docx_data.most_repost.count = post.reposts
            docx_data.most_repost['text'] = post.text.slice(0, 20) + "..."
            docx_data.most_repost['link'] = post.post_link
            docx_data.most_repost['group'] = post.group_name
        }
        switch (post.sentiment) {
            case("Позитивный"):
                docx_data.positives += 1
                break
            case("Нейтральный"):
                docx_data.neutrals += 1
                break
            case("Негативный"):
                docx_data.negatives += 1
                break
            default:
                break
        }
    })
    return docx_data
}

function textSnippet(cell, row) {
    const text = row.text ? row.text : "В посте нет текста"
    return (
        <div>
            <OverlayTrigger overlay={<Tooltip id="tooltip-disabled">Нажмите чтобы увидеть полный текст </Tooltip>}>
                <span>{text.slice(0, 100)}...</span>
            </OverlayTrigger>
        </div>
    );
}

class App extends Component {
    state = {
        SN: undefined,
        today: new Date(),
        groups: [],
        groups_filter: [],
        data: [],
        sm_ids: undefined,
        columns: [{
            text: "Отображаемые поля не выбранны"
        }],
        from: undefined,
        to: undefined,
        buttonDisable: true,
        isLoading: false,
        timeplot_data: [],
        docx_data: undefined,
        dataLoaded: false
    };
    initial_state = {...this.state};


    constructor() {
        super();
        console.log(version)
        this.handleFromChange = this.handleFromChange.bind(this);
        this.handleToChange = this.handleToChange.bind(this);
        this.handleInput = this.handleInput.bind(this);
    }

    handleSelectSN(SN) {
        let ready = this.isReady(SN, this.state.from, this.state.to, this.state.sm_ids)
        this.setState({SN: SN, buttonDisable: ready})
    }

    isReady(SN, from, to, sm_ids) {
        return !(SN && from && to && sm_ids)
    }

    load_data() {
        const {sm_ids, from, to, SN} = this.state
        const from_unix = from.getTime() / 1000
        const to_unix = to.getTime() / 1000

        this.setState({
            isLoading: true,
            data: this.initial_state.data,
            groups: this.initial_state.groups,
            groups_filter: this.initial_state.groups_filter,
            timeplot_data: this.initial_state.timeplot_data,
            dataLoaded: false,
        })
        const sm_ids_prepared = sm_ids.replace(/\s/g, '')
        const url = WEBSERVER + '/api/statistics?social_network=' +
            SN + '&sm_id=' + sm_ids_prepared + '&start_date=' + from_unix + '&end_date=' + to_unix
        fetch(url)
            .then(res => res.json()
                .then(response => {
                    if (response["error"] !== '')
                        console.log('error on response', response["error"])
                    if (response["response"]["count"] !== 0) {
                        let data = Object.values(response["response"]["posts"])
                            .sort(function (a, b) {
                                a = new Date(a.post_date);
                                b = new Date(b.post_date);
                                return a > b ? -1 : a < b ? 1 : 0;
                            });
                        let groups = data.map(post => post.group_name)
                        groups = [...new Set(groups)]
                        let groups_filter = groups.map(group => {
                            return {value: group, label: group}
                        })
                        let timeplot_data = prepareDataForChart(data, groups)
                        let docx_data = makeDocxData(data)
                        switch (SN) {
                            case('tg'):
                                docx_data["SN"] = "Телеграм"
                                break
                            case('vk'):
                                docx_data["SN"] = "ВКонтакте"
                                break
                            default:
                                break
                        }
                        this.setState({
                            data: data,
                            groups: groups,
                            groups_filter: groups_filter,
                            timeplot_data: timeplot_data,
                            docx_data: docx_data,
                            dataLoaded: true
                        })
                    } else {
                        console.log("Ни одно из сообществ не найдено, проверьте правильность написания")
                    }
                    this.setState({
                        isLoading: false,
                    })
                })
                .catch((error) => {
                    console.log("Ошибка при парсинге ответа, обратитесь к разработчику", error)
                    this.setState({isLoading: false})
                })).catch((error) => {
            console.log("Ошибка при запросе, обратитесь к разработчику", error)
            this.setState({isLoading: false})
            }
        )
    }

    handleInput(sm_ids) {
        let ready = this.isReady(this.state.SN, this.state.from, this.state.to, sm_ids)
        this.setState({sm_ids: sm_ids, buttonDisable: ready})
    }

    showFromMonth() {
        const {from, to} = this.state;
        if (!from) {
            return;
        }
        if (moment(to).diff(moment(from), 'months') < 2) {
            this.to.getDayPicker().showMonth(from);
        }
    }

    handleFromChange(from) {
        let ready = this.isReady(this.state.SN, from, this.state.to, this.state.sm_ids)
        this.setState({from: from, buttonDisable: ready});
    }

    handleToChange(to) {
        let ready = this.isReady(this.state.SN, this.state.from, to, this.state.sm_ids)
        this.setState({to: to, buttonDisable: ready}, this.showFromMonth);
    }

    handleSelectCol(array) {

        let unsorted_arr = []
        const map = new Map()
        for (const item of array) {
            if (!map.has(item.serial)) {
                map.set(item.serial, true);    // set any value to Map
                unsorted_arr.push(item);
            }
        }
        let columns = unsorted_arr.sort((a, b) => a.serial - b.serial)
        let result = columns.length > 0 ? columns : this.initial_state.columns
        if (columns)
            this.setState({columns: result})
    }

    createDocx() {
        const {docx_data} = this.state
        const doc = new Document({
            styles: {
                paragraphStyles: [
                    {
                        id: "biggerNormal",
                        name: "BiggerNormal",
                        basedOn: "Normal",
                        next: "Normal",
                        run: {
                            size: 28,
                        },
                    }
                ]
            }
        });
        doc.addSection({
            children: [
                new Paragraph({
                    text: docx_data.SN,
                    heading: HeadingLevel.HEADING_1,

                }),
                new Paragraph({
                    style: "biggerNormal",
                    children: [
                        new TextRun("Наиболее популярными постами в "),
                        new TextRun({
                            text: docx_data.SN, bold: true, size: 28
                        }),
                        new TextRun(" за выбранный период, стали:"),
                    ]
                }),
                new Paragraph({
                    bullet: {level: 0},
                    style: "biggerNormal",
                    children: [
                        new TextRun({size: 28, text: "По просмотрам – "}),
                        new TextRun({text: docx_data.most_view.text, size: 28}),
                        new TextRun({size: 28, text: " ("}),
                        new TextRun({text: docx_data.most_view.group, size: 28}),
                        new TextRun({size: 28, text: "), с количеством просмотров "}),
                        new TextRun({text: docx_data.most_view.count, size: 28}),
                        new TextRun({size: 28, text: "Ссылка: "}).break(),
                        new TextRun({text: docx_data.most_view.link, size: 28})]
                }),
                new Paragraph({
                    bullet: {level: 0},
                    style: "biggerNormal",
                    children: [new TextRun({size: 28, text: "По репостам – "}),
                        new TextRun({text: docx_data.most_repost.text, size: 28}),
                        new TextRun({size: 28, text: "("}),
                        new TextRun({text: docx_data.most_repost.group, size: 28}),
                        new TextRun({size: 28, text: "), с количеством репостов "}),
                        new TextRun({text: docx_data.most_repost.count, size: 28}),
                        new TextRun({size: 28, text: "Ссылка: "}).break(),
                        new TextRun({text: docx_data.most_repost.link, size: 28})]
                }),
                new Paragraph({
                    style: "biggerNormal",
                    text: "Количество постов по характеру:"
                }),
                new Paragraph({
                    bullet: {level: 0},
                    style: "biggerNormal",
                    children: [
                        new TextRun({text: docx_data.negatives, size: 28}),
                        new TextRun({size: 28, text: " постов - негативные;\n"})]
                }),
                new Paragraph({
                    bullet: {level: 0},
                    style: "biggerNormal",
                    children: [
                        new TextRun({text: docx_data.neutrals, size: 28}),
                        new TextRun({size: 28, text: " постов - нейтральные;\n"})]
                }),
                new Paragraph({
                    bullet: {level: 0},
                    style: "biggerNormal",
                    children: [
                        new TextRun({text: docx_data.positives, size: 28}),
                        new TextRun({size: 28, text: " постов - позитивные;\n"})]
                })
            ]
        })
        Packer.toBlob(doc).then((blob) => {// saveAs from FileSaver will download the file
            saveAs(blob, "Отчёт.docx");
        });

    }

    render() {
        const {from, to, today, columns, data, buttonDisable, timeplot_data, isLoading, dataLoaded} = this.state;
        const modifiers = {start: from, end: to};
        let tonePie = {"Нейтральный": 0, "Негативный": 0, "Позитивный": 0}
        data.map(post => {
                tonePie[post.sentiment] = 1
        })

        function tableFormatDate(date) {
            return new Date(date).toLocaleString('ru-RU')
        }

        const columns_select = [
            {
                serial: 0,
                text: "Группа",
                dataField: 'group_name',
                filter: selectFilter({
                    options: this.state.groups_filter,
                    placeholder: ' '
                })
            },
            {
                serial: 1,
                text: "Подписчики",
                dataField: "members",
                filter: numberFilter({placeholder: ' '})
            },
            {

                serial: 2,
                text: "Дата, время",
                dataField: "post_date",
                formatter: tableFormatDate,
                filter: dateFilter({style: {width: "100%"}, placeholder: ' '})
            },
            {
                serial: 3,
                text: 'Текст \n',
                dataField: "text",
                formatter: textSnippet,
                filter: textFilter({placeholder: 'Поиск'})
            },
            {
                serial: 4,
                text: "Просмотры",
                dataField: "views",
                filter: numberFilter({placeholder: ' '}),
                sort: true
            },
            {
                serial: 5,
                text: "Репосты",
                dataField: "reposts",
                filter: numberFilter({placeholder: 'Введите значение'}),
                sort: true
            }, {
                serial: 6,
                text: "Комментарии",
                dataField: "comments",
                filter: numberFilter({placeholder: ' '}),
                sort: true
            },
            {
                serial: 7,
                text: "Лайки",
                dataField: "likes",
                filter: numberFilter({placeholder: ' '}),
                sort: true
            },
            {
                serial: 8,
                text: "Аномальные просмотры",
                dataField: "is_anomaly",
                filter: selectFilter({
                    options: [{value: "Да", label: "Да"}, {value: "Нет", label: "Нет"}],
                    placeholder: ' '
                }),
                sort: true,
                placeholder: ' '
            },
            {
                serial: 9,
                text: "Тональный характер",
                dataField: "sentiment",
                filter: selectFilter({
                    options: [{value: "Позитивный", label: "Позитивный"},
                        {value: "Нейтральный", label: "Нейтральный"},
                        {value: "Негативный", label: "Негативный"}],
                    placeholder: ' '
                }),
                sort: true
            }
        ]
        const pagination_options = {sizePerPageRenderer}
        return (
            <>
                <Navbar expand="lg" bg="dark" variant="dark">
                    <Navbar.Brand href="#home">
                        Программа определения тональности постов в социальных сетях и сбора статистики
                    </Navbar.Brand>
                </Navbar>
                <Container className='mt-4 mb-4'>
                    <Row className='ml-4 mr-4 mb-4'>
                        <Select
                            key="sm_select"
                            placeholder={"Соц. сеть"}
                            options={[{value: 'vk', label: 'ВКонтакте'}, {value: 'tg', label: 'Телеграм'}]}
                            style={{width: 150}}
                            onChange={val => this.handleSelectSN(val[0].value)}
                        />
                        <div className="InputFromTo ml-4">
                            <DayPickerInput
                                value={from}
                                placeholder="С"
                                format="LL"
                                formatDate={formatDate}
                                parseDate={parseDate}
                                dayPickerProps={{
                                    // eslint-disable-next-line
                                    selectedDays: [from, {from, to}],
                                    disabledDays: {after: today},
                                    toMonth: to,
                                    modifiers,
                                    numberOfMonths: 2,
                                    locale: 'ru',
                                    localeUtils: MomentLocaleUtils,
                                    onDayClick: () => this.to.getInput().focus(),
                                }}
                                onDayChange={this.handleFromChange}
                            />{' '}
                            —{' '}
                            <span className="InputFromTo-to">
                                    <DayPickerInput
                                        ref={el => (this.to = el)}
                                        value={to}
                                        placeholder="По"
                                        format="LL"
                                        formatDate={formatDate}
                                        parseDate={parseDate}
                                        dayPickerProps={{
                                            selectedDays: [from, {from, to}],
                                            disabledDays: {before: from, after: today},
                                            modifiers,
                                            month: from,
                                            fromMonth: from,
                                            numberOfMonths: 2,
                                            locale: 'ru',
                                            localeUtils: MomentLocaleUtils,
                                        }}
                                        onDayChange={this.handleToChange}
                                    />
                                    </span>
                            <Helmet>
                            </Helmet>
                        </div>
                    </Row>
                    <Row className='ml-4 mr-4 mb-4'>
                        <Col>
                            <Form.Group controlId="exampleForm.ControlTextarea1">
                                <Form.Label>Введите ID сообществ через запятую, например, doxajournal,
                                    thevyshka</Form.Label>
                                <Form.Control as="textarea" rows="3"
                                              onChange={event => this.handleInput(event.target.value)}
                                />
                            </Form.Group>
                        </Col>
                        <Col>
                            <Form.Label>Выберите поля для отображения</Form.Label>
                            <Select
                                placeholder={"Отображаемые поля"}
                                multi
                                values={[]}
                                key="table_fields"
                                valueField={"serial"}
                                labelField={"text"}
                                options={columns_select}
                                onChange={selected => {
                                    this.handleSelectCol(selected)
                                }}
                            />
                        </Col>
                    </Row>
                    <Row className='ml-4 mr-4 mb-4'>
                        <Button variant="primary" size="lg" block
                                disabled={buttonDisable || isLoading}
                                onClick={!isLoading && !buttonDisable ? this.load_data.bind(this) : undefined}>
                            {isLoading ? 'Загрузка...' : 'Загрузить данные'}
                        </Button>
                    </Row>
                    <CSVLink className='btn btn-info ml-4 mr-4'
                             data={data}
                             separator={";"}
                             filename={"posts.csv"}
                             disabled={!dataLoaded}
                    >
                        Скачать CSV</CSVLink>
                    <Button
                        disabled={!dataLoaded}
                        className='btn btn-info ml-4 mr-4'
                        onClick={!isLoading && !buttonDisable ? this.createDocx.bind(this) : undefined}
                    >Скачать отчёт</Button>
                    <DoubleScrollbar>
                        <BootstrapTable
                            striped
                            condensed
                            data={data}
                            keyField="index"
                            columns={columns}
                            expandRow={expandRow}
                            filter={filterFactory()}
                            pagination={paginationFactory(pagination_options)}
                        />
                    </DoubleScrollbar>
                    <Plot
                        data={timeplot_data}
                        className="w-100"
                        style={{visibility: dataLoaded ? "visible" : "hidden"}}
                        layout={{
                            title: 'Среднее количество просмотров постов, сделанных в указанный день',
                            xaxis: {
                                dtick: 86400000,
                                title: 'Даты',
                                type: 'date',
                                tickformat: '%d/%m'
                            },
                            yaxis: {
                                title: 'Средние просмотры у одного поста'
                            }
                        }}
                    />
                    <Plot
                        className="w-100"
                        data={[{
                            type: "pie",
                            values: Object.values(tonePie),
                            labels: Object.keys(tonePie),
                            textinfo: "label+percent",
                            insidetextorientation: "radial"
                        }]}
                        layout={{
                            title: 'Распределение тональности'
                        }}
                        style={{visibility: dataLoaded ? "visible" : "hidden"}}
                    />

                </Container>
            </>
        )
            ;
    }
}

export default App;