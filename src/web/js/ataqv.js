//
// Copyright 2015 Stephen Parker
//
// Licensed under Version 3 of the GPL or any later version
//

/* global d3, $ */

var ataqv = (function() {
    let consoleEnabled = true;

    let configuration = {};
    let plots = {};
    let legendItemState = new Map();
    let dispatch = d3.dispatch('legendChange', 'plotItemInspect', 'sampleInspect');

    function localStorageAvailable() {
        try {
            let x = '__storage_test__';
            window.localStorage.setItem(x, x);
            window.localStorage.removeItem(x);
            return true;
        }
        catch(e) {
            return false;
        }
    }

    function hideHelp() {
        hideMask();
        for (let visibleHelp of querySelectorAll('.visibleHelp')) {
            visibleHelp.classList.remove('visibleHelp');
            if (localStorageAvailable()) {
                window.localStorage.setItem(visibleHelp.id, 'seen');
            }
        }
    }

    function showHelp(helpID) {
        let help = document.getElementById(helpID);
        help.classList.add('visibleHelp');
    }

    function hideMask() {
        let mask = document.getElementById('mask');
        mask.classList.remove('active');
    }

    function showMask() {
        let mask = document.getElementById('mask');
        mask.classList.add('active');
    }

    function log(first, ...rest) {
        if (consoleEnabled) {
            console.log(first, ...rest);
        }
    }

    function closest(startNode, className) {
        let parentNode = startNode.parentNode;
        let result = null;
        while (parentNode.parentNode) {
            if (parentNode.classList.contains(className)) {
                result = parentNode;
            }
            parentNode = parentNode.parentNode;
        }
        return result
    }

    function formatNumber(n) {
        if (isNaN(parseInteger(n))) {
            if (isNaN(parseFloat(n))) {
                return n;
            } else {
                return n.toPrecision(3);
            }
        } else {
            return n;
        }
    }

    let formatIntegerForLocale = window.Intl ?
        new Intl.NumberFormat(
            window.navigator.languages || [window.navigator.language || window.navigator.userLanguage],
            {
                localeMatcher: 'best fit',
                maximumFractionDigits: 0
            }
        ).format : formatNumber;

    let formatNumberForLocale = window.Intl ?
        new Intl.NumberFormat(
            window.navigator.languages || [window.navigator.language || window.navigator.userLanguage],
            {
                localeMatcher: 'best fit',
                minimumFractionDigits: 3,
                maximumFractionDigits: 3
            }
        ).format : formatNumber;

    function hrefToID(href) {
        let id = null;
        if (typeof(href) === 'string' && href.lastIndexOf('#') != -1) {
            id = href.split('#')[1];
        }
        return id;
    }

    function parseInteger(value) {
        if(/^(\-|\+)?([0-9]+|Infinity)$/.test(value))
            return Number(value);
        return NaN;
    }

    function querySelectorAll(selectors, elementOrId) {
        let container;
        selectors = typeof(selectors) == 'string' ? [selectors] : selectors;
        if (elementOrId) {
            container = typeof(elementOrId) == 'string' ? document.getElementById(elementOrId) : elementOrId;
        } else {
            container = document;
        }
        let result = selectors.map(function(selector) {return Array.from(container.querySelectorAll(selector));}).reduce(function(p, c, i, a) {return p.concat(c);}, []);
        return result;
    }

    function getAttribute(object, path) {
        let value = object;
        for (let component of path.split('.'))  {
            value = value[component];
        }
        return value;
    }

    function setAttribute(object, path, value) {
        let components = path.split('.');
        for (let i = 0; i < components.length - 1; i++) {
            let component = components[i];
            if (!(component in object)) {
                object[component] = {};
            }
            object = object[component];
        }
        object[components[components.length - 1]] = value;
    }

    function activateTab(tabID) {
        hideHelp();
        document.getElementById('help').dataset.helpid = tabID + 'Help';
        let tablist = document.getElementById('tabs');
        for (let t of querySelectorAll(['.tab'], tablist)) {
            if (t.dataset.tab === tabID) {
                t.classList.add('active');
            } else {
                t.classList.remove('active');
            }

            let tab = document.getElementById(t.dataset.tab);
            if (tab.id === tabID) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        }
    }

    function debounce(func, wait) {
        let timeout = null;
        let last = null;
        return function() {
            let now = Date.now();
            let elapsed = now - last;
            if (!timeout || elapsed > wait) {
                last = now;
                let context = this;
                let args = arguments;

                let deferred = function() {
                    requestAnimationFrame(function() {func.apply(context, args);});
                    if (timeout) {
                        clearTimeout(timeout);
                        timeout = null;
                    }
                };

                if (timeout) {
                    clearTimeout(timeout);
                    timeout = null;
                }
                timeout = setTimeout(deferred, wait);
            }
        };
    }

    function addEventListeners() {
        window.addEventListener('resize', debounce(populatePlots, 500));

        for (let tab of querySelectorAll(['.tab a'])) {
            tab.addEventListener('click', function(evt) {
                evt.preventDefault();
                let tabLink = evt.target;
                if (!tabLink.classList.contains('tabLink')) {
                    tabLink = closest(evt.target, 'tabLink');
                }
                let id = hrefToID(tabLink.href);
                if (id) {
                    activateTab(id);
                    return false;
                }
            });
        }

        document.getElementById('mask').addEventListener('click', function(evt) {
            hideHelp();
        }, true);

        document.getElementById('help').addEventListener('click', function(evt) {
            evt.preventDefault();
            showMask();
            let helpID = evt.target.dataset.helpid;
            showHelp(helpID);
        }, true);

        for (let helpCloser of querySelectorAll(['.help .cleaner'])) {
            helpCloser.addEventListener('click', hideHelp, true);
        }

        document.body.addEventListener('keyup', function(evt) {
            if (evt.target.tagName === 'INPUT') {
                return true;
            }

            switch (evt.keyCode) {
            case 27: hideHelp(); break;
            case 69: activateTab('experimentTabBody'); break;
            case 84: activateTab('tableTabBody'); break;
            case 80: activateTab('plotTabBody'); break;
            }
        });
    }

    function listExperiments() {
        let metadata = [];

        for (let experimentID in configuration.metrics) {
            let experiment_metrics = configuration.metrics[experimentID];
            experiment_metrics.library_description = experiment_metrics.library.description;
            experiment_metrics.description_with_url = experiment_metrics.url ? '<a target="_blank" href="' + experiment_metrics.url + '">' + experiment_metrics.description + '</a>' : experiment_metrics.description;
            experiment_metrics.download_link = '<a href="' + experiment_metrics.metrics_url + '" class="metrics_url download" download>Download</a>';
            metadata.push(experiment_metrics);
        }

        $('#experimentsTable').DataTable( {
            data: metadata,
            columns: [
                {data: 'name'},
                {data: 'library.sample'},
                {data: 'library.library'},
                {data: 'library_description'},
                {data: 'description_with_url'},
                {data: 'download_link', orderable: false, searchable: false}
            ],
            ordering: [[0, 'asc'], [1, 'asc'], [2, 'asc']],
            responsive: true,
            rowId: 'name',
            stateSave: true
        });
    }

    function clearStatus() {
        let msg = document.getElementById('message');
        msg.innerHTML = '';

        let status = document.getElementById('status');
        status.classList.remove('active');
    }

    function setStatus(content, showSpinner) {
        let msg = document.getElementById('message');
        msg.innerHTML = content ? content : '';

        let spinner = document.getElementById('spinner');
        spinner.style.visibility = showSpinner ? 'visible' : 'hidden';

        let status = document.getElementById('status');
        status.classList.add('active');
    }

    function getWidth(el) {
        let width = el.offsetWidth;
        let style = window.getComputedStyle(el);
        width = width - parseInt(style.paddingLeft) - parseInt(style.paddingRight);
        return width;
    }

    function getHeight(el) {
        let height = el.offsetHeight;
        let style = window.getComputedStyle(el);
        height = height - parseInt(style.paddingTop) - parseInt(style.paddingBottom);
        return height;
    }

    function wrapY(text, width, x) {
        text.each(function() {
            let text = d3.select(this),
                words = text.text().split(/\s+/).reverse(),
                word,
                line = [],
                lineNumber = 0,
                lineHeight = 1.1, // ems
                y = text.attr('y') || '0.0',
                dy = parseFloat(text.attr('dy') || '0.0'),
                tspan = text.text(null).append('tspan').attr('x', x).attr('y', y).attr('dy', dy + 'em');

            let yOffset = lineNumber * lineHeight + dy;
            while ((word = words.pop())) {
                line.push(word);
                tspan.text(line.join(' '));
                if (tspan.node().getComputedTextLength() > width) {
                    line.pop();
                    tspan.text(line.join(' '));
                    line = [word];
                    yOffset = ++lineNumber * lineHeight + dy;
                    tspan = text.append('tspan').attr('x', x).attr('y', y).attr('dy', yOffset + 'em').text(word);
                }
            }
        });
    }

    function selectLegendItem(evt) {
        evt.preventDefault();
        let li = evt.target.classList.contains('legendItem') ? evt.target : closest(evt.target, 'legendItem');
        if (li && li.dataset && li.dataset.sample) {
            let sample = li.dataset.sample;
            if (legendItemState.get(sample)) {
                legendItemState.set(sample, false);
            } else {
                legendItemState.set(sample, true);
            }
            dispatch.call('legendChange');
        }
    }

    function changeSampleVisibility() {
        for (let [sample, selected] of legendItemState) {
            d3.selectAll('.plotItem[data-sample=' + sample + ']').classed('hidden', !selected);
            d3.selectAll('.legendItem[data-sample=' + sample + ']').classed('targetHidden', !selected);
        }
    }

    dispatch.on('legendChange', changeSampleVisibility);

    function deselectAllLegendItems() {
        for (let sample of legendItemState.keys()) {
            legendItemState.set(sample, false);
        }
        dispatch.call('legendChange');
    }

    function selectAllLegendItems() {
        for (let sample of legendItemState.keys()) {
            legendItemState.set(sample, true);
        }
        dispatch.call('legendChange');
    }

    function makeFragmentLengthDistancePlot() {
        let containerID = 'fragmentLengthDistancePlot';
        let container = document.getElementById(containerID);
        let plotElement = container.querySelector('.plot');
        let detail = container.querySelector('.detail');

        let help = (
            '<p>Mouse over dots to see experiment details.</p>' +
                '<p>Double click or use the mouse wheel or trackpad scroll to zoom. Drag to pan.</p>' +
                '<p>Mouse over legend items to highlight samples. Click them to toggle sample visibility.</p>'
        );

        let yAxisSelect = container.querySelector('.yaxis-select');
        if (yAxisSelect) {
            help += '<p>You can change the data source of the y axis with the Y AXIS select box below.</p>';
        }

        return function() {
            plotElement.innerHTML = '';
            detail.innerHTML = help;

            let yAxisLabel = yAxisSelect.options[yAxisSelect.selectedIndex].innerHTML;

            function getYValue(experiment) {
                let y;
                let yAxisSource = yAxisSelect.value;
                switch(yAxisSource) {
                case 'short_mononucleosomal_ratio':
                    y = experiment[yAxisSource];
                    break;
                case 'duplicate_autosomal_reads':
                    y = (100.0 * (experiment[yAxisSource] / experiment.total_autosomal_reads));
                    break;
                default:
                    y = (100.0 * (experiment[yAxisSource] / experiment.total_reads));
                }
                return y;
            }


            function makeLibrary(experimentID) {
                let experiment = configuration.metrics[experimentID];
                if (experiment) {
                    return {
                        experimentID: experimentID,
                        library: experiment.library.library || experiment.name,
                        sample: experiment.library.sample || experiment.name,
                        description: experiment.library.description,
                        x: experiment.fragment_length_distance,
                        y: getYValue(experiment)
                    };
                }
            }

            let data = [];
            let samples = new Map();
            let experimentIDs = Object.keys(configuration.metrics).sort();
            for (let e = 0; e < experimentIDs.length; e++) {
                let experimentID = experimentIDs[e];
                let library = makeLibrary(experimentID);
                data.push(library);

                let sample = library.sample;
                if (samples.get(sample)) {
                    samples.get(sample).libraries.push(library);
                } else {
                    samples.set(sample, {libraries: [library]});
                }
            }

            for (let s of samples.values()) {
                s.minDistance = d3.min(s.libraries, function(d) {return d.x;});
                s.maxDistance = d3.max(s.libraries, function(d) {return d.x;});
                s.meanDistance = (s.libraries.reduce(function(a, b) {return {x: a.x + b.x};}, {x: 0}).x / s.libraries.length);
                let squaresOfDifferences = s.libraries.map(function(a) {return Math.pow(a.x - s.meanDistance, 2);});
                let meanSquareOfDifferences = squaresOfDifferences.reduce(function(a, b) {return a + b;}, 0) / squaresOfDifferences.length;
                let stddev = Math.sqrt(meanSquareOfDifferences);
                s.distanceStandardDeviation = stddev;
            }

            let margin = {top: 15, right: 20, bottom: 100, left: 100};
            let width = getWidth(plotElement) - margin.left - margin.right;
            let height = getHeight(plotElement) - margin.bottom;
            let totalWidth = width + margin.left + margin.right;
            let totalHeight = height + margin.top + margin.bottom;

            // setup x
            let xValue = function(d) {return d.x;};  // data -> value
            let xScale = d3.scaleLinear().range([0, width]);  // value -> display
            let xMap = function(d) {return xScale(xValue(d));};  // data -> display
            let xAxis = d3.axisBottom(xScale).tickSize(-height);

            // setup y
            let yValue = function(d) { return d.y;}; // data -> value
            let yScale = d3.scaleLinear().range([height, 0]); // value -> display
            let yMap = function(d) { return yScale(yValue(d));}; // data -> display
            let yAxis = d3.axisLeft(yScale).tickSize(-width);

            // setup fill color
            let cValue = function(d) { return d.sample;};
            let color = d3.scaleOrdinal(d3.schemeCategory20c);

            let limit = Math.max(Math.abs(d3.min(data, xValue)), Math.abs(d3.max(data, xValue))) * 1.05;
            if (d3.min(data, xValue) < 0) {
                xScale.domain([-1 * limit, limit]);
            } else {
                xScale.domain([0, limit]);
            }
            yScale.domain([0, d3.max(data, yValue) + 10]);

            let svg = d3.select(plotElement).append('svg')
                .attr('class', 'plotRoot')
                .attr('width', totalWidth)
                .attr('height', totalHeight)
                .attr('viewBox', '0 0 ' + totalWidth + ' ' + totalHeight)
                .attr('preserveAspectRatio', 'xMinYMin');

            let main = svg.append('g')
                .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

            main.append('rect')
                .attr('fill', 'rgba(255, 255, 255, 0)')
                .attr('class', 'plotBackground')
                .attr('width', width)
                .attr('height', height);

            // y-axis
            let yAxisG = main.append('g')
                .attr('class', 'y axis')
                .call(yAxis);

            yAxisG.append('text')
                .attr('class', 'label')
                .attr('transform', 'rotate(-90), translate(0, -20)')
                .attr('x', height * -0.5)
                .attr('y', -50)
                .style('text-anchor', 'middle')
                .style('border', '1px solid #f00')
                .text(yAxisLabel);

            yAxisG.selectAll('text.label').call(wrapY, height * 0.8, height * -0.5);

            // x-axis
            let xAxisG = main.append('g')
                .attr('class', 'x axis')
                .attr('transform', 'translate(0,' + height + ')')
                .call(xAxis);

            xAxisG.selectAll('text')
                .attr('dx', '-1.25em')
                .attr('dy', '0.75em')
                .attr('transform', 'rotate(-45)');

            xAxisG.append('text')
                .attr('class', 'label')
                .attr('x', width * 0.5)
                .attr('y', 60)
                .style('text-anchor', 'middle')
                .text('Distance from reference fragment length distribution');

            if (d3.min(data, xValue) < 0) {
                svg.selectAll('.x .tick')
                    .classed('origin',function(d, i){
                        return (d == 0);
                    });
            }

            dispatch.on('plotItemInspect.' + containerID, function() {
                let experiment = configuration.metrics[this];
                if (experiment) {
                    let library = makeLibrary(this);
                    d3.selectAll('.plotItem').classed('unhighlight', true).classed('highlight', false);
                    d3.selectAll('.plotItem[data-experiment="' + library.experimentID + '"]').classed('highlight', true).raise();
                    detail.innerHTML =
                        '<div><h3>' + library.experimentID + '</h3>' +
                        '<table><tbody>' +
                        '<tr><th>Library</th><td>' + library.library + '</td></tr>' +
                        '<tr><th>Sample</th><td>' + library.sample + '</td></tr>' +
                        '<tr><th>Description</th><td>' + library.description + '</td></tr>' +
                        '<tr><th>' + yAxisLabel + '</th><td>' + formatNumberForLocale(library.y) + '</td></tr>' +
                        '<tr><th>Distance</th><td>' + d3.format('.10g')(library.x) + '</td></tr>' +
                        '</tbody></table></div>';
                } else {
                    d3.selectAll('.plotItem').classed('unhighlight', false).classed('highlight', false);
                    detail.innerHTML = help;
                }
            });

            let dots = main.append('svg')
                .attr('width', width)
                .attr('height', height);

            // draw dots
            dots.selectAll('.dot')
                .data(data)
                .enter().append('circle')
                .attr('class', function(d) {
                    let classes = 'dot plotItem';
                    if (!legendItemState.get(d.sample)) {
                        classes += ' hidden';
                    }
                    return classes;
                })
                .attr('data-sample', function(d) {return d.sample;})
                .attr('data-experiment', function(d) {return d.experimentID;})
                .attr('r', 5.5)
                .attr('cx', xMap)
                .attr('cy', yMap)
                .style('fill', function(d) { return color(cValue(d));})
                .on('click', function(d) {
                    d3.select(d3.event.target).lower();
                })
                .on('mouseover', function(d) {dispatch.call('plotItemInspect', d.experimentID);})
                .on('mouseout', function() {dispatch.call('plotItemInspect', null);});

            function zoomed() {
                let transform = d3.event.transform;

                // rescale the x linear scale so that we can draw the x axis
                xAxis.scale(transform.rescaleX(xScale));
                xAxisG.call(xAxis);

                // rescale the y linear scale so that we can draw the y axis
                yAxis.scale(transform.rescaleY(yScale));
                yAxisG.call(yAxis);

                // draw the dots in their new positions
                let dots = svg.selectAll('.dot');
                let newR = 5.5 - Math.log(transform.k);
                dots.attr('transform', transform)
                    .attr('r', newR);
            }

            let zoom = d3.zoom()
                .scaleExtent([1, 40])
                .on('zoom', zoomed);

            svg.call(zoom);

            // draw legend
            let legendContainer = container.querySelector('.legend');
            legendContainer.innerHTML = '';

            let legend = document.createElement('ul');
            for (let sampleID of [...samples.keys()].sort()) {
                let legendItem = document.createElement('li');
                legendItem.classList.add('legendItem');
                if (samples.size < 7) {
                    legendItem.style.flexBasis = '100%';
                }

                if (!legendItemState.get(sampleID)) {
                    legendItem.classList.add('targetHidden');
                }

                legendItem.dataset.sample = sampleID;

                let legendItemColor = document.createElement('span');
                legendItemColor.classList.add('legendItemColor');
                legendItemColor.style.backgroundColor = color(sampleID);
                legendItem.appendChild(legendItemColor);

                let legendItemLabel = document.createElement('span');
                legendItemLabel.classList.add('legendItemLabel');
                legendItemLabel.innerHTML = sampleID;
                legendItem.appendChild(legendItemLabel);

                legend.appendChild(legendItem);
            }
            legendContainer.appendChild(legend);

            legend.addEventListener('click', selectLegendItem, true);

            dispatch.on('sampleInspect.' + containerID, function() {
                let sample = String(this);
                let s = samples.get(sample);
                if (s) {
                    d3.selectAll('.plotItem').classed('unhighlight', true);
                    d3.selectAll('.plotItem[data-sample="' + sample + '"]').raise().classed('highlight', true);

                    let newDetail =
                        '<div><h3>' + sample + '</h3>' +
                        '<table><tbody>' +
                        '<tr><th>Libraries:</th><td>' + s.libraries.length + '</td></tr>' +
                        '<tr><th>Minimum distance:</th><td>' + s.minDistance + '</td></tr>' +
                        '<tr><th>Maximum distance:</th><td>' + s.maxDistance + '</td></tr>' +
                        '<tr><th>Mean distance:</th><td>' + s.meanDistance + '</td></tr>' +
                        '<tr><th>Standard deviation:</th><td>' + s.distanceStandardDeviation + '</td></tr>' +
                        '</tbody></table></div>';

                    detail.innerHTML = newDetail;
                } else {
                    d3.selectAll('.plotItem').classed('unhighlight', false).classed('highlight', false);
                    detail.innerHTML = help;
                }
            });

            legend.addEventListener('mouseover', function(evt) {
                evt.preventDefault();
                if (evt.target.classList.contains('legendItemColor') || evt.target.classList.contains('legendItemLabel')) {
                    let li = evt.target.classList.contains('legendItem') ? evt.target : closest(evt.target, 'legendItem');
                    if (li && li.dataset && li.dataset.sample) {
                        dispatch.call('sampleInspect', li.dataset.sample);
                    }
                }
            }, true);

            legend.addEventListener('mouseout', function(evt) {
                evt.preventDefault();
                if (evt.target.classList.contains('legendItemColor') || evt.target.classList.contains('legendItemLabel')) {
                    let li = evt.target.classList.contains('legendItem') ? evt.target : closest(evt.target, 'legendItem');
                    if (li && li.dataset && li.dataset.sample) {
                        dispatch.call('sampleInspect', null);
                    }
                }
            }, true);

            d3.select(container).select('.hideall').on('click', deselectAllLegendItems);
            d3.select(container).select('.showall').on('click', selectAllLegendItems);

            function reset() {
                detail.innerHTML = help;
                svg.transition()
                    .duration(500)
                    .call(zoom.transform, d3.zoomIdentity);
            }

            container.querySelector('.reset').addEventListener('click', reset, true);
        };
    }

    plots.plotFragmentLengthDistance = makeFragmentLengthDistancePlot();

    function makeLinePlot(containerID, provideData, extraHelp) {
        //
        // containerID is the ID of a .plotContainer
        //
        // provideData is a function that returns an object with these properties:
        //    series -- an array of objects, each containing:
        //              - experimentID
        //              - library
        //              - description
        //              - sampleID
        //              - line (an array of objects containing the properties x and y)
        //
        //    xMax -- the extent of the x axis
        //    yMax -- the extent of the y axis
        //    xLabel -- the label for the x axis
        //    yLabel -- the label for the y axis
        //
        let container = document.getElementById(containerID);

        let help = ('<p>Mouse over lines to see experiment details.</p>' +
                    '<p>Double click or use the mouse wheel or trackpad scroll to zoom. Drag to pan.</p>' +
                    '<p>Mouse over legend items to highlight samples. Click them to toggle sample visibility.</p>');

        let resolutionSelect = container.querySelector('.resolution');
        if (resolutionSelect) {
            help += '<p>You can smooth the lines to make it easier to compare experiments, or make the plot more ' +
                'responsive if you have a lot of data.</p>';
        }

        if (extraHelp) {
            help += extraHelp;
        }

        return function() {
            let plotElement = container.querySelector('.plot');
            let detail = container.querySelector('.detail');
            let legendContainer = container.querySelector('.legend');

            plotElement.innerHTML = '';
            detail.innerHTML = help;
            legendContainer.innerHTML = '';

            let data = provideData(containerID);

            let samples = new Map();
            let experimentIDs = Object.keys(configuration.metrics).sort();
            for (let experimentID of experimentIDs) {
                let datum = data.series[experimentID];

                if (samples.get(datum.sample)) {
                    samples.get(datum.sample).libraries.push(datum);
                } else {
                    samples.set(datum.sample, {libraries: [datum]});
                }
            }

            let margin = {top: 15, right: 20, bottom: 100, left: 100};
            let width = getWidth(plotElement) - margin.left - margin.right;
            let height = getHeight(plotElement) - margin.bottom;
            let totalWidth = width + margin.left + margin.right;
            let totalHeight = height + margin.top + margin.bottom;

            // setup x
            let xValue = function(d) {return d.x;};
            let xScale = d3.scaleLinear().range([0, width]).domain([0, data.xMax]);

            let xMap = function(d) {return xScale(xValue(d));};
            let xAxis = d3.axisBottom(xScale).tickSize(-height);

            // setup y
            let yValue = function(d) { return d.y;};

            let yScaleSelect = container.querySelector('.yScale');
            let yScaleExponent = yScaleSelect ? Number.parseFloat(yScaleSelect.value) : 1;

            // The scale is switched by changing the exponent;
            // d3.scalePow with exponent 1 is effective linear.
            let yScale = d3.scalePow().exponent(yScaleExponent).range([height, 0]).domain([0, data.yMax]);
            let yMap = function(d) { return yScale(yValue(d));};
            let yAxis = d3.axisLeft(yScale).tickSize(-width).ticks(5);

            let color = d3.scaleOrdinal(d3.schemeCategory20c);

            let svg = d3.select(plotElement).append('svg')
                .attr('class', 'plotRoot')
                .attr('width', totalWidth)
                .attr('height', totalHeight)
                .attr('viewBox', '0 0 ' + totalWidth + ' ' + totalHeight)
                .attr('preserveAspectRatio', 'xMinYMin');

            let main = svg.append('g')
                .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

            main.append('rect')
                .attr('class', 'plotBackground')
                .attr('width', width)
                .attr('height', height);

            // x-axis
            let xAxisG = main.append('g')
                .attr('class', 'x axis')
                .attr('transform', 'translate(0,' + height + ')')
                .call(xAxis);

            xAxisG.append('text')
                .attr('class', 'label')
                .attr('x', width * 0.5)
                .attr('y', 60)
                .style('text-anchor', 'middle')
                .text(data.xLabel);


            // y-axis
            let yAxisG = main.append('g')
                .attr('class', 'y axis')
                .call(yAxis);

            yAxisG.append('text')
                .attr('class', 'label')
                .attr('transform', 'rotate(-90), translate(0, -' + (margin.left - 30) + ')')
                .style('text-anchor', 'middle')
                .style('border', '1px solid #f00')
                .text(data.yLabel);

            yAxisG.selectAll('text.label').call(wrapY, height * 0.8, height * -0.5);

            function zoomed() {
                let transform = d3.event.transform;

                // rescale the x linear scale so that we can draw the x axis
                xAxis.scale(transform.rescaleX(xScale));
                xAxisG.call(xAxis);

                // rescale the y linear scale so that we can draw the y axis
                yAxis.scale(transform.rescaleY(yScale));
                yAxisG.call(yAxis);

                // draw the lines in their new positions
                let lines = svg.selectAll('.line');
                lines.attr('transform', transform);
            }

            let zoom = d3.zoom()
                .scaleExtent([1, 2])
                .on('zoom', zoomed);

            svg.call(zoom);

            // draw lines
            let line = d3.line()
                .curve(d3.curveBasis)
                .x(xMap)
                .y(yMap);

            let plot = main.append('svg')
                .attr('width', width)
                .attr('height', height);

            for (let experimentID of experimentIDs) {
                let datum = data.series[experimentID];

                plot.append('path')
                    .datum(datum.line)
                    .attr('class', function(d) {
                        let classes = 'line plotItem';
                        if (!legendItemState.get(datum.sample)) {
                            classes += ' hidden';
                        }
                        return classes;
                    })
                    .attr('data-sample', datum.sample)
                    .attr('data-experiment', datum.experimentID)
                    .attr('d', line)
                    .style('fill', 'none')
                    .style('stroke', color(datum.sample))
                    .on('click', function(d) {
                        d3.select(d3.event.target).lower();
                    })
                    .on('mouseover', makeMouseoverHandler(datum))
                    .on('mouseout', handleMouseout);
            }

            let referenceToggle = container.querySelector('.referenceToggle');
            let showReference = referenceToggle ? referenceToggle.checked : true;

            if (data.reference_series) {
                plot.append('path')
                    .datum(data.reference_series.line)
                    .attr('class', function() {
                        return 'line reference ' + (showReference ? '' : 'hidden');
                    })
                    .attr('d', line)
                    .style('fill', 'none')
                    .on('click', function(d) {
                        d3.select(d3.event.target).lower();
                    });
            }

            function makeMouseoverHandler(d) {
                return function() {
                    dispatch.call('plotItemInspect', d.experimentID);
                };
            }

            function handleMouseout() {
                dispatch.call('plotItemInspect', null);
            }

            dispatch.on('plotItemInspect.' + containerID, function() {
                let experiment = configuration.metrics[this];
                if (experiment) {
                    let library = {
                        experimentID: this,
                        library: experiment.library.library || this,
                        sample: (experiment.library.sample || experiment.name),
                        description: experiment.library.description
                    };

                    d3.selectAll('.plotItem').classed('unhighlight', true).classed('highlight', false);
                    d3.selectAll('.plotItem[data-experiment="' + library.experimentID + '"]').classed('highlight', true).raise();
                    detail.innerHTML =
                        '<div><h3>' + library.experimentID + '</h3>' +
                        '<table><tbody>' +
                        '<tr><th>Library</th><td>' + library.library + '</td></tr>' +
                        '<tr><th>Sample</th><td>' + library.sample + '</td></tr>' +
                        '<tr><th>Description</th><td>' + library.description + '</td></tr>' +
                        '</tbody></table></div>';
                } else {
                    d3.selectAll('.plotItem').classed('unhighlight', false).classed('highlight', false);
                    detail.innerHTML = help;
                }
                d3.selectAll('.reference').raise();
            });

            // draw legend
            let legend = document.createElement('ul');
            for (let sampleID of [...samples.keys()].sort()) {
                let legendItem = document.createElement('li');
                legendItem.classList.add('legendItem');
                if (samples.size < 7) {
                    legendItem.style.flexBasis = '100%';
                }

                if (!legendItemState.get(sampleID)) {
                    legendItem.classList.add('targetHidden');
                }

                legendItem.dataset.sample = sampleID;

                let legendItemColor = document.createElement('span');
                legendItemColor.classList.add('legendItemColor');
                legendItemColor.style.backgroundColor = color(sampleID);
                legendItem.appendChild(legendItemColor);

                let legendItemLabel = document.createElement('span');
                legendItemLabel.classList.add('legendItemLabel');
                legendItemLabel.innerHTML = sampleID;
                legendItem.appendChild(legendItemLabel);

                legend.appendChild(legendItem);
            }
            legendContainer.appendChild(legend);

            legend.addEventListener('click', selectLegendItem, true);

            dispatch.on('sampleInspect.' + containerID, function() {
                let sample = String(this);
                let s = samples.get(sample);
                if (s) {
                    d3.selectAll('.plotItem').classed('unhighlight', true);
                    d3.selectAll('.plotItem[data-sample="' + sample + '"]').raise().classed('highlight', true);

                    let newDetail =
                        '<div><h3>' + sample + '</h3>' +
                        '<table><tbody>' +
                        '<tr><th>Libraries:</th><td>' + s.libraries.length + '</td></tr>' +
                        '</tbody></table></div>';
                    detail.innerHTML = newDetail;
                } else {
                    d3.selectAll('.plotItem').classed('unhighlight', false).classed('highlight', false);
                    detail.innerHTML = help;
                }
                d3.selectAll('.reference').raise();
            });

            legend.addEventListener('mouseover', function(evt) {
                evt.preventDefault();
                if (evt.target.classList.contains('legendItemColor') || evt.target.classList.contains('legendItemLabel')) {
                    let li = evt.target.classList.contains('legendItem') ? evt.target : closest(evt.target, 'legendItem');
                    if (li && li.dataset && li.dataset.sample) {
                        dispatch.call('sampleInspect', li.dataset.sample);
                    }
                }
            }, true);

            legend.addEventListener('mouseout', function(evt) {
                evt.preventDefault();
                if (evt.target.classList.contains('legendItemColor') || evt.target.classList.contains('legendItemLabel')) {
                    let li = evt.target.classList.contains('legendItem') ? evt.target : closest(evt.target, 'legendItem');
                    if (li && li.dataset && li.dataset.sample) {
                        dispatch.call('sampleInspect', null);
                    }
                }
            }, true);

            d3.select(container).select('.hideall').on('click', deselectAllLegendItems);
            d3.select(container).select('.showall').on('click', selectAllLegendItems);

            function reset() {
                detail.innerHTML = help;
                svg.transition()
                    .duration(500)
                    .call(zoom.transform, d3.zoomIdentity);
            }

            d3.select(container).select('.reset').on('click', reset);
        };
    }

    plots.plotFragmentLength = makeLinePlot(
        'fragmentLengthPlot',
        function(containerID) {
            let container = document.getElementById(containerID);
            let experimentIDs = Object.keys(configuration.metrics).sort();

            let fragment_length_counts = [];
            for (let experimentID of experimentIDs) {
                let m = configuration.metrics[experimentID];
                fragment_length_counts.push(Object.keys(m['fragment_length_counts']).length);
            }
            let maximumInterestingFragmentLength = d3.min(fragment_length_counts);

            let result = {
                series: {},
                reference_series: {
                    source: configuration.fragment_length_reference.source,
                    line: []
                },
                xMax: maximumInterestingFragmentLength,
                yMax: 0.0,
                xLabel: 'Fragment length (bp)',
                yLabel: 'Fraction of all reads'
            };

            let resolutionSelect = container.querySelector('.resolution');
            let resolution = resolutionSelect ? Number.parseInt(resolutionSelect.value) : 10;

            for (let e = 0; e < experimentIDs.length; e++) {
                let experimentID = experimentIDs[e];
                let experiment = configuration.metrics[experimentID];

                result.series[experimentID] = {
                    experimentID: experimentID,
                    library: experiment.library.library || experiment.name,
                    description: experiment.library.description,
                    sample: (experiment.library.sample || experiment.name),
                    line: []
                };

                let sum = 0;
                for (let fl = 0; fl < maximumInterestingFragmentLength; fl++) {
                    let fractionOfReadCount = (experiment.fragment_length_counts[fl][1] || 0);

                    sum += fractionOfReadCount;

                    if (fl % resolution == 0) {
                        let mean = sum/resolution;
                        if (mean > result.yMax) {
                            result.yMax = mean;
                        }

                        result.series[experimentID].line.push({
                            x: fl,
                            y: mean
                        });
                        sum = 0;
                    }
                }
            }

            // add reference distribution
            let sum = 0;
            for (let fl = 0; fl < maximumInterestingFragmentLength; fl++) {
                let fractionOfReadCount = (configuration.fragment_length_reference.distribution[fl][1] || 0);

                sum += fractionOfReadCount;

                if (fl % resolution == 0) {
                    let mean = sum/resolution;
                    if (mean > result.yMax) {
                        result.yMax = mean;
                    }

                    result.reference_series.line.push({
                        x: fl,
                        y: mean
                    });
                    sum = 0;
                }
            }

            return result;
        },
        '<p>Switching the y axis scale to exponential can reveal nucleosomal periodicity at higher fragment lengths.</p><p>The dashed red line is the reference fragment length distribution. You can toggle it on and off.</p>'
    );

    plots.plotMapq = makeLinePlot(
        'mapqPlot',
        function(containerID) {
            let experimentIDs = Object.keys(configuration.metrics).sort();

            let result = {
                series: {},
                xMax: 0.0,
                yMax: 0.0,
                xLabel: 'Mapping quality',
                yLabel: 'Fraction of all reads'
            };

            for (let e = 0; e < experimentIDs.length; e++) {
                let experimentID = experimentIDs[e];
                let experiment = configuration.metrics[experimentID];

                result.series[experimentID] = {
                    experimentID: experimentID,
                    library: experiment.library.library,
                    description: experiment.library.description,
                    sample: (experiment.library.sample || experiment.name),
                    line: []
                };

                let totalReads = experiment.total_reads;
                for (let mqc of experiment.mapq_counts) {
                    if (mqc[0] > result.xMax) {
                        result.xMax = mqc[0];
                    }

                    let normed = mqc[1] / totalReads;

                    if (normed > result.yMax) {
                        result.yMax = normed;
                    }

                    result.series[experimentID].line.push({
                        x: mqc[0],
                        y: normed
                    });
                }
            }
            return result;
        }
    );

    plots.plotPeakReadCounts = makeLinePlot(
        'peakReadCountsPlot',
        function(containerID) {
            let experimentIDs = Object.keys(configuration.metrics).sort();

            let result = {
                series: {},
                xMax: 100,
                yMax: 0.0,
                xLabel: 'Peak percentile',
                yLabel: 'Cumulative fraction of high-quality autosomal reads'
            };

            for (let e = 0; e < experimentIDs.length; e++) {
                let experimentID = experimentIDs[e];
                let experiment = configuration.metrics[experimentID];

                result.series[experimentID] = {
                    experimentID: experimentID,
                    library: experiment.library.library,
                    description: experiment.library.description,
                    sample: (experiment.library.sample || experiment.name),
                    line: []
                };

                let percentiles = experiment.peak_percentiles
                    ? experiment.peak_percentiles.cumulative_fraction_of_hqaa
                    : new Array(100).fill(0);

                let cumulativeFractionOfHQAA = 0.0;
                for (let percentile = 0; percentile < 100; percentile++) {
                    cumulativeFractionOfHQAA = percentile < percentiles.length ? percentiles[percentile] : cumulativeFractionOfHQAA;

                    if (cumulativeFractionOfHQAA > result.yMax) {
                        result.yMax = cumulativeFractionOfHQAA;
                    }

                    result.series[experimentID].line.push({
                        x: percentile + 1,
                        y: cumulativeFractionOfHQAA
                    });
                }
            }
            return result;
        }
    );

    plots.plotPeakTerritory = makeLinePlot(
        'peakTerritoryPlot',
        function(containerID) {
            let experimentIDs = Object.keys(configuration.metrics).sort();

            let result = {
                series: {},
                xMax: 100,
                yMax: 0.0,
                xLabel: 'Peak percentile',
                yLabel: 'Cumulative fraction of peak territory'
            };

            for (let e = 0; e < experimentIDs.length; e++) {
                let experimentID = experimentIDs[e];
                let experiment = configuration.metrics[experimentID];

                result.series[experimentID] = {
                    experimentID: experimentID,
                    library: experiment.library.library,
                    description: experiment.library.description,
                    sample: (experiment.library.sample || experiment.name),
                    line: []
                };

                let percentiles = experiment.peak_percentiles
                    ? experiment.peak_percentiles.cumulative_fraction_of_territory
                    : new Array(100).fill(0);


                let cumulativeFractionOfTerritory = 0.0;
                for (let percentile = 0; percentile < 100; percentile++) {
                    cumulativeFractionOfTerritory = percentile < percentiles.length ? percentiles[percentile] : cumulativeFractionOfTerritory;

                    if (cumulativeFractionOfTerritory > result.yMax) {
                        result.yMax = cumulativeFractionOfTerritory;
                    }

                    result.series[experimentID].line.push({
                        x: percentile + 1,
                        y: cumulativeFractionOfTerritory
                    });
                }
            }
            return result;
        }
    );

    function populateTables() {
        let tableMetrics = JSON.parse(JSON.stringify(configuration.metrics));

        for (let table of querySelectorAll('table.data')) {
            let keys = [];
            let order =[];
            let columns = [];

            for (let headerCell of querySelectorAll(['th[data-metric]'], table)) {
                let key = headerCell.dataset.metric;
                keys.push(key);

                let col = {
                    data: key,
                    className: headerCell.className
                };
                columns.push(col);

                if (headerCell.dataset.order) {
                    let cellOrder = headerCell.dataset.order.split(':');
                    order.push([Number.parseInt(cellOrder[0]), cellOrder[1]]);
                }
            }
            order.sort();

            let values = [];
            for (let experimentID of Object.keys(tableMetrics).sort()) {
                let experiment = tableMetrics[experimentID];

                for (let key of keys) {
                    let value = getAttribute(experiment, key);

                    if (typeof(value) == 'number') {
                        if (Number.isInteger && Number.isInteger(value)) {
                            value = formatIntegerForLocale(value);
                        } else {
                            value = formatNumberForLocale(value);
                        }
                    }

                    if (experiment.library.description) {
                        setAttribute(experiment, key, '<span data-hovertext="' + experiment.library.description + '">' + value + '</span>');
                    } else {
                        setAttribute(experiment, key, value);
                    }
                }
                values.push(experiment);
            }

            $('#' + table.id).DataTable({
                data: values,
                columns: columns,
                order: order,
                responsive: true,
                stateSave: true
            });
        }
    }

    function addPlotConfigurationHandlers() {
        for (let plotConfigurationSelect of querySelectorAll('.plot-configuration')) {
            plotConfigurationSelect.addEventListener('change', function() {
                plots[this.dataset.plot]();
            }, true);
        }

        for (let referenceToggle of querySelectorAll('.referenceToggle')) {
            referenceToggle.addEventListener('change', function() {
                let selector = '#' + this.dataset.plot + ' .reference';
                d3.selectAll(selector)
                    .classed('hidden', !this.checked);
            });
        }
    }

    function loadExperiments() {
        addPlotConfigurationHandlers();
        window.setTimeout(function() {
            listExperiments();
            window.setTimeout(function() {
                setStatus('Creating plots...', true);
                populatePlots();
                window.setTimeout(function() {
                    setStatus('Creating metrics tables...', true);
                    window.setTimeout(function() {
                        populateTables();
                        window.setTimeout(function() {
                            clearStatus();
                            document.getElementById('tabbodies').style.position = 'relative';
                            document.getElementById('tabbodies').style.top = 0;
                        }, 10);
                    }, 100);
                }, 100);
            }, 100);
        }, 100);
    }

    function populatePlots() {
        plots.plotFragmentLengthDistance();
        plots.plotFragmentLength();
        plots.plotMapq();
        plots.plotPeakReadCounts();
        plots.plotPeakTerritory();
    }

    function initialize() {
        if (configuration.description) {
            document.getElementById('description').innerHTML = configuration.description;
        }
        for (let experimentID in configuration.metrics) {
            let experiment = configuration.metrics[experimentID];
            legendItemState.set(experiment.library.sample || experiment.name, true);
        }

        addEventListeners();
        loadExperiments();
    }

    function configure(conf) {
        configuration = conf
    }

    return {
        configure: configure,
        initialize: initialize
    };
})();
